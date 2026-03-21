"""
Matrix Solver Worker — Pub/Sub subscriber.

Listens to the 'matrix-solver-trigger' topic for matrix generation jobs.
Each message contains an exam_id to generate the assignment matrix for.
"""

import json
import logging
import os
import sys
import signal
import traceback
from concurrent.futures import TimeoutError as FuturesTimeoutError

from google.cloud import pubsub_v1, firestore, bigquery

from .solver import (
    ExamBlueprint,
    CalibratedQuestion,
    CenterLayout,
    solve_assignment_matrix,
    write_assignment_to_firestore,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("matrix-solver")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "matrix-solver-trigger-sub")

_fs_client = None
_bq_client = None
_shutdown = False


def _get_fs_client() -> firestore.Client:
    global _fs_client
    if _fs_client is None:
        _fs_client = firestore.Client(project=PROJECT_ID)
    return _fs_client


def _get_bq_client() -> bigquery.Client:
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client


def _load_exam_data(
    exam_id: str, fs_client: firestore.Client, bq_client: bigquery.Client
):
    """Load exam blueprint, calibrated questions, and center layouts from Firestore/BigQuery."""

    # Load exam blueprint from Firestore
    exam_doc = fs_client.collection("exams").document(exam_id).get()
    if not exam_doc.exists:
        raise ValueError(f"Exam {exam_id} not found in Firestore")

    exam_data = exam_doc.to_dict()
    blueprint_data = exam_data.get("blueprint", {})

    blueprint = ExamBlueprint(
        questions_per_paper=blueprint_data.get("questionsPerPaper", 100),
        topic_distribution=blueprint_data.get("topicCoverage", {}),
        difficulty_target=blueprint_data.get("difficultyTarget", 0.0),
    )

    # Load calibrated questions from BigQuery
    query = f"""
        SELECT
            ip.template_id,
            ip.instantiation_id,
            ip.discrimination_a,
            ip.difficulty_b,
            ip.guessing_c,
            q.topic
        FROM `{bq_client.project}.pariksha_analytics.irt_parameters` ip
        JOIN `{bq_client.project}.pariksha_analytics.question_metadata` q
            ON ip.template_id = q.template_id
        WHERE q.status = 'production'
          AND ip.discrimination_a > 0.3
    """
    df = bq_client.query(query).to_dataframe()

    questions = []
    for _, row in df.iterrows():
        qid = f"{row['template_id']}_{row['instantiation_id']}"
        questions.append(
            CalibratedQuestion(
                question_id=qid,
                template_id=row["template_id"],
                instantiation_id=row["instantiation_id"],
                topic=row["topic"],
                difficulty_b=float(row["difficulty_b"]),
                discrimination_a=float(row["discrimination_a"]),
                guessing_c=float(row["guessing_c"]),
            )
        )

    # Load center layouts from Firestore
    centers = []
    centers_ref = fs_client.collection("exams").document(exam_id).collection("centers")
    for center_doc in centers_ref.stream():
        center_data = center_doc.to_dict()
        center_id = center_doc.id
        seat_ids = center_data.get("seatIds", [])

        # Build adjacency from seat layout (consecutive seats are adjacent)
        adjacency = []
        for i in range(len(seat_ids) - 1):
            adjacency.append((seat_ids[i], seat_ids[i + 1]))

        # Also handle row-based adjacency if layout info is available
        seats_per_row = center_data.get("seatsPerRow", 0)
        if seats_per_row > 0:
            for i in range(len(seat_ids)):
                # Seat behind (next row, same column)
                behind_idx = i + seats_per_row
                if behind_idx < len(seat_ids):
                    adjacency.append((seat_ids[i], seat_ids[behind_idx]))

        centers.append(
            CenterLayout(
                center_id=center_id,
                seat_ids=seat_ids,
                adjacency_pairs=adjacency,
            )
        )

    logger.info(
        "Loaded exam data: blueprint=%s, questions=%d, centers=%d",
        blueprint.topic_distribution,
        len(questions),
        len(centers),
    )

    return blueprint, questions, centers


def _handle_message(message: pubsub_v1.subscriber.message.Message) -> None:
    """Process a single matrix solver trigger message.

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

        logger.info("Starting matrix solver for exam: %s", exam_id)

        fs_client = _get_fs_client()
        bq_client = _get_bq_client()

        # Load input data
        blueprint, questions, centers = _load_exam_data(exam_id, fs_client, bq_client)

        if not questions:
            logger.error("No calibrated questions available for exam %s", exam_id)
            message.ack()
            return

        if not centers:
            logger.error("No centers configured for exam %s", exam_id)
            message.ack()
            return

        # Solve
        result = solve_assignment_matrix(
            exam_blueprint=blueprint,
            questions=questions,
            centers=centers,
            fs_client=fs_client,
            exam_id=exam_id,
        )

        # Write results to Firestore
        questions_by_id = {q.question_id: q for q in questions}
        write_assignment_to_firestore(fs_client, exam_id, result, questions_by_id)

        logger.info(
            "Matrix solver complete for exam %s: %d papers, energy=%.4f, converged=%s",
            exam_id,
            len(result.assignments),
            result.energy,
            result.converged,
        )

        message.ack()

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message: %s", str(e))
        message.ack()
    except Exception as e:
        logger.error(
            "Error processing matrix solver job: %s\n%s",
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

    logger.info("Matrix Solver worker starting. Listening on: %s", subscription_path)

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
        logger.info("Matrix Solver worker shut down cleanly.")


if __name__ == "__main__":
    main()
