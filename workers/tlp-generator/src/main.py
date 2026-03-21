"""
TLP Generator Worker — Pub/Sub subscriber.

Listens to the 'tlp-generation-trigger' topic for puzzle generation requests.
Each message contains a key to seal and a target release time.
"""

import base64
import json
import logging
import os
import sys
import signal
import traceback
from datetime import datetime, timezone
from concurrent.futures import TimeoutError as FuturesTimeoutError

from google.cloud import pubsub_v1, firestore

from .tlp import generate_time_lock_puzzle, TimeLockPuzzle
from .benchmark import benchmark_squarings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("tlp-generator")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "tlp-generation-trigger-sub")

_fs_client = None
_shutdown = False
_squarings_per_sec = None  # Cached benchmark result


def _get_fs_client() -> firestore.Client:
    global _fs_client
    if _fs_client is None:
        _fs_client = firestore.Client(project=PROJECT_ID)
    return _fs_client


def _get_squarings_per_sec(fs_client: firestore.Client, exam_id: str) -> int:
    """Get or compute the squarings per second benchmark.

    First checks Firestore for a cached value, then runs benchmark if needed.
    """
    global _squarings_per_sec

    if _squarings_per_sec is not None:
        return _squarings_per_sec

    # Check Firestore for cached calibration
    doc = fs_client.collection("exams").document(exam_id).get()
    if doc.exists:
        data = doc.to_dict()
        calibration = data.get("tlpCalibration", {})
        cached = calibration.get("squaringsPerSec")
        if cached:
            _squarings_per_sec = int(cached)
            logger.info("Using cached benchmark: %d squarings/sec", _squarings_per_sec)
            return _squarings_per_sec

    # Run benchmark
    logger.info("No cached benchmark found, running benchmark...")
    _squarings_per_sec = benchmark_squarings(modulus_bits=4096, duration_seconds=10.0)

    # Cache result in Firestore
    fs_client.collection("exams").document(exam_id).set(
        {
            "tlpCalibration": {
                "squaringsPerSec": _squarings_per_sec,
                "measuredOn": datetime.now(timezone.utc).isoformat(),
                "safetyMarginSec": 30,
            }
        },
        merge=True,
    )

    return _squarings_per_sec


def _handle_message(message: pubsub_v1.subscriber.message.Message) -> None:
    """Process a single TLP generation trigger message.

    Expected message format (JSON):
    {
        "exam_id": "exam_abc123",
        "question_id": "q_001",
        "encrypted_key_b64": "base64-encoded-key",
        "target_release_time": "2026-03-22T10:00:00Z"
    }
    """
    try:
        data = json.loads(message.data.decode("utf-8"))
        exam_id = data.get("exam_id")
        question_id = data.get("question_id")
        key_b64 = data.get("encrypted_key_b64")
        target_time_str = data.get("target_release_time")

        if not all([exam_id, question_id, key_b64, target_time_str]):
            logger.error("Message missing required fields: %s", list(data.keys()))
            message.ack()
            return

        # Decode key
        key = base64.b64decode(key_b64)

        # Parse target time
        target_time = datetime.fromisoformat(target_time_str.replace("Z", "+00:00"))

        logger.info(
            "Generating TLP: exam=%s, question=%s, target=%s",
            exam_id,
            question_id,
            target_time.isoformat(),
        )

        fs_client = _get_fs_client()

        # Get hardware benchmark
        squarings_per_sec = _get_squarings_per_sec(fs_client, exam_id)

        # Generate puzzle
        puzzle = generate_time_lock_puzzle(
            key=key,
            target_time=target_time,
            squarings_per_sec=squarings_per_sec,
            safety_margin_seconds=30,
        )

        # Store puzzle in Firestore
        puzzle_ref = (
            fs_client.collection("exams")
            .document(exam_id)
            .collection("tlpPuzzles")
            .document(question_id)
        )
        puzzle_ref.set({
            "n": str(puzzle.n),
            "a": str(puzzle.a),
            "t": puzzle.t,
            "cipher": str(puzzle.cipher),
            "keySizeBytes": puzzle.key_size_bytes,
            "targetReleaseTime": target_time.isoformat(),
            "squaringsPerSec": squarings_per_sec,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })

        logger.info(
            "TLP generated and stored: exam=%s, question=%s, t=%d",
            exam_id,
            question_id,
            puzzle.t,
        )

        message.ack()

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message: %s", str(e))
        message.ack()
    except ValueError as e:
        logger.error("Validation error: %s", str(e))
        message.ack()
    except Exception as e:
        logger.error(
            "Error generating TLP: %s\n%s",
            str(e),
            traceback.format_exc(),
        )
        message.nack()


def _signal_handler(signum, frame):
    global _shutdown
    logger.info("Received signal %d, shutting down...", signum)
    _shutdown = True


def main() -> None:
    """Main entry point: subscribe to Pub/Sub and process messages."""
    global _shutdown

    if not PROJECT_ID:
        logger.error("GOOGLE_CLOUD_PROJECT environment variable is required")
        sys.exit(1)

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    subscriber = pubsub_v1.SubscriberClient()
    subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)

    flow_control = pubsub_v1.types.FlowControl(
        max_messages=2,  # Can process a couple puzzles concurrently
        max_bytes=10 * 1024 * 1024,
    )

    logger.info("TLP Generator worker starting. Listening on: %s", subscription_path)

    streaming_pull_future = subscriber.subscribe(
        subscription_path,
        callback=_handle_message,
        flow_control=flow_control,
    )

    try:
        while not _shutdown:
            try:
                streaming_pull_future.result(timeout=10)
            except FuturesTimeoutError:
                continue
            except Exception as e:
                logger.error("Streaming pull error: %s", str(e))
                if not _shutdown:
                    streaming_pull_future = subscriber.subscribe(
                        subscription_path,
                        callback=_handle_message,
                        flow_control=flow_control,
                    )
    finally:
        streaming_pull_future.cancel()
        streaming_pull_future.result(timeout=30)
        subscriber.close()
        logger.info("TLP Generator worker shut down cleanly.")


if __name__ == "__main__":
    main()
