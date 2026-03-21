"""
IRT Calibrator Worker — Pub/Sub subscriber.

Listens to the 'irt-calibration-trigger' topic for calibration job messages.
Each message contains a template_id to calibrate using field test data.
"""

import json
import logging
import os
import sys
import signal
import traceback
from concurrent.futures import TimeoutError as FuturesTimeoutError

from google.cloud import pubsub_v1, bigquery, firestore

from .calibrator import calibrate_template

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("irt-calibrator")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "irt-calibration-trigger-sub")
ACK_DEADLINE_SECONDS = 600  # 10 minutes for long calibrations

# Global clients (reused across messages)
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
    """Process a single calibration trigger message.

    Expected message format (JSON):
    {
        "template_id": "template_abc123",
        "triggered_by": "field-test-complete"
    }
    """
    try:
        data = json.loads(message.data.decode("utf-8"))
        template_id = data.get("template_id")

        if not template_id:
            logger.error("Message missing template_id: %s", data)
            message.ack()
            return

        logger.info("Starting calibration for template: %s", template_id)

        result = calibrate_template(
            template_id=template_id,
            bq_client=_get_bq_client(),
            fs_client=_get_fs_client(),
        )

        if "error" in result:
            logger.error(
                "Calibration failed for template %s: %s",
                template_id,
                result["error"],
            )
        else:
            logger.info(
                "Calibration complete for template %s: %d instantiations, equivalent=%s, flagged=%d",
                template_id,
                result["num_instantiations"],
                result["is_equivalent"],
                len(result["flagged_instantiations"]),
            )

        message.ack()

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message: %s", str(e))
        message.ack()  # Don't retry malformed messages
    except Exception as e:
        logger.error(
            "Unexpected error processing message: %s\n%s",
            str(e),
            traceback.format_exc(),
        )
        message.nack()  # Retry on transient errors


def _signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    global _shutdown
    logger.info("Received signal %d, initiating graceful shutdown...", signum)
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
        max_messages=1,  # Process one calibration at a time
        max_bytes=10 * 1024 * 1024,  # 10 MB
    )

    logger.info(
        "IRT Calibrator worker starting. Listening on subscription: %s",
        subscription_path,
    )

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
        logger.info("IRT Calibrator worker shut down cleanly.")


if __name__ == "__main__":
    main()
