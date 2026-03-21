"""
Score Equator Worker — Pub/Sub subscriber.

Listens to the 'score-equation-trigger' topic for score equating jobs.
Each message contains an exam_id to equate scores for.
"""

import json
import logging
import os
import sys
import signal
import traceback
from concurrent.futures import TimeoutError as FuturesTimeoutError

from google.cloud import pubsub_v1, bigquery, firestore

from .equator import equate_scores

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("score-equator")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "score-equation-trigger-sub")

_bq_client = None
_fs_client = None
_shutdown = False


def _get_bq_client() -> bigquery.Client:
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client


def _get_fs_client() -> firestore.Client:
    global _fs_client
    if _fs_client is None:
        _fs_client = firestore.Client(project=PROJECT_ID)
    return _fs_client


def _handle_message(message: pubsub_v1.subscriber.message.Message) -> None:
    """Process a single score equating trigger message.

    Expected message format (JSON):
    {
        "exam_id": "exam_abc123"
    }
    """
    try:
        data = json.loads(message.data.decode("utf-8"))
        exam_id = data.get("exam_id")

        if not exam_id:
            logger.error("Message missing exam_id: %s", data)
            message.ack()
            return

        logger.info("Starting score equating for exam: %s", exam_id)

        result = equate_scores(
            exam_id=exam_id,
            bq_client=_get_bq_client(),
            fs_client=_get_fs_client(),
        )

        if "error" in result:
            logger.error(
                "Score equating failed for exam %s: %s",
                exam_id,
                result["error"],
            )
        else:
            logger.info(
                "Score equating complete for exam %s: equating_applied=%s, "
                "ks_stat=%.4f, p=%.6f, max_adj=%.4f",
                exam_id,
                result["equating_applied"],
                result["ks_statistic"],
                result["p_value"],
                result["max_score_adjustment"],
            )

        # Update exam status in Firestore
        _get_fs_client().collection("exams").document(exam_id).set(
            {
                "equatingResult": {
                    "equatingApplied": result.get("equating_applied", False),
                    "ksStatistic": result.get("ks_statistic", 0.0),
                    "pValue": result.get("p_value", 1.0),
                    "maxScoreAdjustment": result.get("max_score_adjustment", 0.0),
                    "numCandidates": result.get("num_candidates", 0),
                    "numVariants": result.get("num_variants", 0),
                }
            },
            merge=True,
        )

        message.ack()

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message: %s", str(e))
        message.ack()
    except Exception as e:
        logger.error(
            "Error in score equating: %s\n%s",
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
        max_messages=1,
        max_bytes=10 * 1024 * 1024,
    )

    logger.info("Score Equator worker starting. Listening on: %s", subscription_path)

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
        logger.info("Score Equator worker shut down cleanly.")


if __name__ == "__main__":
    main()
