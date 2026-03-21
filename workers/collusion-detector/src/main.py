"""
Collusion Detector Worker — Pub/Sub subscriber.

Listens to the 'collusion-detection-trigger' topic for detection jobs.
Each message contains an exam_id and center_id to analyze.
"""

import json
import logging
import os
import sys
import signal
import traceback
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from google.cloud import pubsub_v1, bigquery, firestore, storage

from .detector import detect_collusion, CollusionResult
from .cluster_analysis import find_cheating_rings
from .evidence_report import generate_pdf_report, upload_report_to_gcs
from .threshold_calibration import (
    compute_null_distribution,
    calibrate_threshold,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("collusion-detector")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
SUBSCRIPTION_ID = os.environ.get("PUBSUB_SUBSCRIPTION", "collusion-detection-trigger-sub")
GCS_REPORT_BUCKET = os.environ.get("GCS_REPORT_BUCKET", "pariksha-reports")
DATASET_ID = "pariksha_analytics"

_bq_client = None
_fs_client = None
_gcs_client = None
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


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client(project=PROJECT_ID)
    return _gcs_client


def _load_responses(
    bq_client: bigquery.Client, exam_id: str, center_id: str
) -> Tuple[List[str], Dict[str, np.ndarray], int]:
    """Load candidate responses from BigQuery.

    Returns:
        Tuple of (candidate_ids, responses_dict, max_question_index).
    """
    query = f"""
        SELECT
            candidate_id,
            question_index,
            selected_option
        FROM `{bq_client.project}.{DATASET_ID}.exam_responses`
        WHERE exam_id = @exam_id AND center_id = @center_id
        ORDER BY candidate_id, question_index
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("exam_id", "STRING", exam_id),
            bigquery.ScalarQueryParameter("center_id", "STRING", center_id),
        ]
    )

    df = bq_client.query(query, job_config=job_config).to_dataframe()
    if df.empty:
        return [], {}, 0

    candidate_ids = sorted(df["candidate_id"].unique().tolist())
    max_q = int(df["question_index"].max()) + 1

    responses: Dict[str, np.ndarray] = {}
    for cand_id in candidate_ids:
        cand_df = df[df["candidate_id"] == cand_id]
        resp = np.full(max_q, -1, dtype=np.int32)
        for _, row in cand_df.iterrows():
            resp[int(row["question_index"])] = int(row["selected_option"])
        responses[cand_id] = resp

    return candidate_ids, responses, max_q


def _load_distractor_profiles(
    bq_client: bigquery.Client, exam_id: str
) -> Tuple[Dict[int, np.ndarray], Dict[int, int]]:
    """Load distractor profiles and correct answers from BigQuery.

    Returns:
        Tuple of (distractor_profiles, correct_answers).
    """
    query = f"""
        SELECT
            question_index,
            correct_option,
            option_a_prob,
            option_b_prob,
            option_c_prob,
            option_d_prob
        FROM `{bq_client.project}.{DATASET_ID}.exam_distractor_profiles`
        WHERE exam_id = @exam_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("exam_id", "STRING", exam_id),
        ]
    )

    df = bq_client.query(query, job_config=job_config).to_dataframe()

    profiles: Dict[int, np.ndarray] = {}
    correct_answers: Dict[int, int] = {}

    for _, row in df.iterrows():
        q_idx = int(row["question_index"])
        profiles[q_idx] = np.array([
            row["option_a_prob"],
            row["option_b_prob"],
            row["option_c_prob"],
            row["option_d_prob"],
        ], dtype=np.float64)
        correct_answers[q_idx] = int(row["correct_option"])

    return profiles, correct_answers


def _load_or_calibrate_threshold(
    fs_client: firestore.Client,
    exam_id: str,
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int],
) -> float:
    """Load calibrated threshold from Firestore, or compute it."""
    # Check if we have a pre-calibrated threshold
    doc = fs_client.collection("exams").document(exam_id).get()
    if doc.exists:
        data = doc.to_dict()
        threshold = data.get("collusionThreshold")
        if threshold is not None:
            logger.info("Using pre-calibrated threshold: %.4f", threshold)
            return float(threshold)

    # Compute null distribution and calibrate
    logger.info("Calibrating threshold from null distribution...")
    null_scores = compute_null_distribution(
        num_questions=len(distractor_profiles),
        distractor_profiles=distractor_profiles,
        correct_answers=correct_answers,
        num_simulated_pairs=100000,
    )

    threshold, calibration_info = calibrate_threshold(null_scores, target_fpr=0.0001)

    # Store calibrated threshold
    fs_client.collection("exams").document(exam_id).set(
        {
            "collusionThreshold": threshold,
            "collusionCalibration": calibration_info,
        },
        merge=True,
    )

    return threshold


def _write_results_to_stores(
    exam_id: str,
    center_id: str,
    flagged_results: List[CollusionResult],
    clusters: list,
    bq_client: bigquery.Client,
    fs_client: firestore.Client,
    gcs_client: storage.Client,
    distractor_profiles: Dict[int, Dict[int, float]],
    correct_answers: Dict[int, int],
    candidate_seats: Dict[str, str],
) -> None:
    """Write collusion results to Firestore, BigQuery, and generate PDF reports."""

    # Write to Firestore
    collusion_ref = (
        fs_client.collection("collusionResults")
        .document(exam_id)
        .collection(center_id)
    )

    for result in flagged_results:
        pair_id = f"{result.candidate_u}_{result.candidate_v}"
        collusion_ref.document(pair_id).set({
            "candidateU": result.candidate_u,
            "candidateV": result.candidate_v,
            "logLambda": result.log_lambda,
            "threshold": result.threshold,
            "flagged": result.flagged,
            "numSharedQuestions": result.num_shared_questions,
            "numSameWrong": result.num_same_wrong,
            "numDiffWrong": result.num_diff_wrong,
            "evidence": result.evidence_details,
        })

    # Write to BigQuery
    bq_rows = []
    for result in flagged_results:
        bq_rows.append({
            "exam_id": exam_id,
            "center_id": center_id,
            "candidate_u": result.candidate_u,
            "candidate_v": result.candidate_v,
            "log_lambda": result.log_lambda,
            "threshold": result.threshold,
            "flagged": result.flagged,
            "num_shared_questions": result.num_shared_questions,
            "num_same_wrong": result.num_same_wrong,
            "num_diff_wrong": result.num_diff_wrong,
        })

    if bq_rows:
        table_ref = f"{bq_client.project}.{DATASET_ID}.collusion_scores"
        errors = bq_client.insert_rows_json(table_ref, bq_rows)
        if errors:
            logger.error("BigQuery insert errors: %s", errors)

    # Generate PDF reports for flagged pairs
    # Convert numpy arrays to plain dicts for the report generator
    profile_dicts: Dict[int, Dict[int, float]] = {}
    for q_idx, profile_arr in distractor_profiles.items():
        if isinstance(profile_arr, np.ndarray):
            profile_dicts[q_idx] = {i: float(profile_arr[i]) for i in range(len(profile_arr))}
        else:
            profile_dicts[q_idx] = dict(profile_arr)

    for result in flagged_results:
        pair_id = f"{result.candidate_u}_{result.candidate_v}"
        try:
            pdf_bytes = generate_pdf_report(
                pair_result=result,
                distractor_profiles=profile_dicts,
                correct_answers=correct_answers,
                candidate_seats=candidate_seats,
                exam_id=exam_id,
                center_id=center_id,
            )
            gcs_uri = upload_report_to_gcs(
                gcs_client, GCS_REPORT_BUCKET, exam_id, pair_id, pdf_bytes
            )

            # Update Firestore with report URI
            collusion_ref.document(pair_id).set(
                {"reportUri": gcs_uri}, merge=True
            )
        except Exception as e:
            logger.error("Failed to generate PDF for pair %s: %s", pair_id, str(e))

    # Write cluster summary
    for cluster in clusters:
        cluster_ref = (
            fs_client.collection("collusionResults")
            .document(exam_id)
            .collection("clusters")
            .document(f"cluster_{cluster.cluster_id}")
        )
        cluster_ref.set({
            "centerId": center_id,
            "members": cluster.members,
            "pairs": [list(p) for p in cluster.pairs],
            "maxLogLambda": cluster.max_log_lambda,
            "meanLogLambda": cluster.mean_log_lambda,
            "totalPairs": cluster.total_pairs,
            "hasSeatingAdjacency": cluster.has_seating_adjacency,
            "evidenceStrength": cluster.evidence_strength,
        })


def _handle_message(message: pubsub_v1.subscriber.message.Message) -> None:
    """Process a single collusion detection trigger message.

    Expected message format (JSON):
    {
        "exam_id": "exam_abc123",
        "center_id": "center_001"
    }
    """
    try:
        data = json.loads(message.data.decode("utf-8"))
        exam_id = data.get("exam_id")
        center_id = data.get("center_id")

        if not exam_id or not center_id:
            logger.error("Message missing exam_id or center_id: %s", data)
            message.ack()
            return

        logger.info("Starting collusion detection: exam=%s, center=%s", exam_id, center_id)

        bq_client = _get_bq_client()
        fs_client = _get_fs_client()
        gcs_client = _get_gcs_client()

        # Load data
        candidate_ids, candidate_responses, max_q = _load_responses(
            bq_client, exam_id, center_id
        )

        if not candidate_ids:
            logger.warning("No responses found for exam=%s, center=%s", exam_id, center_id)
            message.ack()
            return

        distractor_profiles, correct_answers = _load_distractor_profiles(bq_client, exam_id)

        if not distractor_profiles:
            logger.error("No distractor profiles for exam=%s", exam_id)
            message.ack()
            return

        # Calibrate or load threshold
        threshold = _load_or_calibrate_threshold(
            fs_client, exam_id, distractor_profiles, correct_answers
        )

        # Build shared questions map (all candidates share all questions for now)
        shared_questions_map: Dict[Tuple[str, str], List[int]] = {}

        # Run detection
        flagged_results = detect_collusion(
            exam_id=exam_id,
            center_id=center_id,
            candidate_ids=candidate_ids,
            candidate_responses=candidate_responses,
            shared_questions_map=shared_questions_map,
            distractor_profiles=distractor_profiles,
            correct_answers=correct_answers,
            threshold=threshold,
        )

        # Load seating info
        candidate_seats: Dict[str, str] = {}
        seats_ref = (
            fs_client.collection("exams")
            .document(exam_id)
            .collection("centers")
            .document(center_id)
            .collection("seats")
        )
        for seat_doc in seats_ref.stream():
            seat_data = seat_doc.to_dict()
            cand_id = seat_data.get("candidateId")
            if cand_id:
                candidate_seats[cand_id] = seat_doc.id

        # Cluster analysis
        clusters = find_cheating_rings(
            flagged_results=flagged_results,
            seating_map=candidate_seats,
        )

        # Write results
        _write_results_to_stores(
            exam_id=exam_id,
            center_id=center_id,
            flagged_results=flagged_results,
            clusters=clusters,
            bq_client=bq_client,
            fs_client=fs_client,
            gcs_client=gcs_client,
            distractor_profiles=distractor_profiles,
            correct_answers=correct_answers,
            candidate_seats=candidate_seats,
        )

        logger.info(
            "Collusion detection complete: exam=%s, center=%s, "
            "pairs_flagged=%d, clusters=%d",
            exam_id,
            center_id,
            len(flagged_results),
            len(clusters),
        )

        message.ack()

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message: %s", str(e))
        message.ack()
    except Exception as e:
        logger.error(
            "Error in collusion detection: %s\n%s",
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

    logger.info("Collusion Detector worker starting. Listening on: %s", subscription_path)

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
        logger.info("Collusion Detector worker shut down cleanly.")


if __name__ == "__main__":
    main()
