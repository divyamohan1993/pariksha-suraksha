"""
IRT True-Score Equating.

Equates raw scores across different paper variants using IRT-based
true-score equating. For each candidate:
1. Estimate ability theta from their response pattern
2. Compute expected true score on the reference paper

This ensures fairness when different candidates receive papers of
different difficulty levels.
"""

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.special import expit
from google.cloud import bigquery, firestore

from .ability_estimation import estimate_ability, estimate_abilities_batch
from .ks_test import cross_paper_ks_test

logger = logging.getLogger(__name__)

DATASET_ID = "pariksha_analytics"


def _icc_3pl(theta: float, a: float, b: float, c: float) -> float:
    """3PL ICC probability."""
    z = a * (theta - b)
    return c + (1.0 - c) * float(expit(z))


def _compute_expected_true_score(
    theta: float,
    reference_params: List[Dict[str, float]],
) -> float:
    """Compute expected true score on a reference paper given ability theta.

    True score T(theta) = sum_j P_j(theta) where P_j is the ICC for question j
    on the reference paper.

    Args:
        theta: Estimated ability.
        reference_params: IRT parameters for each question on the reference paper.

    Returns:
        Expected number of correct answers on the reference paper.
    """
    return sum(
        _icc_3pl(theta, p["a"], p["b"], p["c"])
        for p in reference_params
    )


def _load_exam_data(
    bq_client: bigquery.Client, exam_id: str
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load raw scores, responses, and IRT params from BigQuery.

    Returns:
        Tuple of (scores_df, responses_df, irt_params_df).
    """
    # Load candidate scores and paper variant assignments
    scores_query = f"""
        SELECT
            r.candidate_id,
            r.paper_variant,
            r.raw_score,
            r.center_id
        FROM `{bq_client.project}.{DATASET_ID}.exam_results` r
        WHERE r.exam_id = @exam_id
    """
    scores_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("exam_id", "STRING", exam_id)
        ]
    )
    scores_df = bq_client.query(scores_query, job_config=scores_config).to_dataframe()

    # Load individual responses
    responses_query = f"""
        SELECT
            candidate_id,
            question_index,
            template_id,
            instantiation_id,
            selected_option,
            correct
        FROM `{bq_client.project}.{DATASET_ID}.exam_responses`
        WHERE exam_id = @exam_id
        ORDER BY candidate_id, question_index
    """
    responses_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("exam_id", "STRING", exam_id)
        ]
    )
    responses_df = bq_client.query(responses_query, job_config=responses_config).to_dataframe()

    # Load IRT parameters for all questions used in this exam
    irt_query = f"""
        SELECT
            ip.template_id,
            ip.instantiation_id,
            ip.discrimination_a,
            ip.difficulty_b,
            ip.guessing_c
        FROM `{bq_client.project}.{DATASET_ID}.irt_parameters` ip
        WHERE EXISTS (
            SELECT 1
            FROM `{bq_client.project}.{DATASET_ID}.exam_responses` er
            WHERE er.exam_id = @exam_id
              AND er.template_id = ip.template_id
              AND er.instantiation_id = ip.instantiation_id
        )
    """
    irt_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("exam_id", "STRING", exam_id)
        ]
    )
    irt_df = bq_client.query(irt_query, job_config=irt_config).to_dataframe()

    logger.info(
        "Loaded exam data: %d candidates, %d responses, %d IRT param sets",
        len(scores_df),
        len(responses_df),
        len(irt_df),
    )

    return scores_df, responses_df, irt_df


def _select_reference_paper(
    scores_df: pd.DataFrame,
) -> str:
    """Select the reference paper variant for equating.

    Selects the variant with the most candidates (most representative).

    Args:
        scores_df: DataFrame with candidate scores and paper variants.

    Returns:
        The variant ID selected as reference.
    """
    variant_counts = scores_df["paper_variant"].value_counts()
    reference = variant_counts.index[0]
    logger.info(
        "Selected reference paper variant: %s (%d candidates)",
        reference,
        variant_counts.iloc[0],
    )
    return reference


def equate_scores(
    exam_id: str,
    bq_client: Optional[bigquery.Client] = None,
    fs_client: Optional[firestore.Client] = None,
) -> Dict:
    """Run the full score equating pipeline for an exam.

    Steps:
    1. Load raw scores + IRT params from BigQuery
    2. Group candidates by paper variant
    3. Run KS test between variant score distributions
    4. If needed, apply IRT true-score equating
    5. Write equated scores to BigQuery + Firestore

    Args:
        exam_id: The exam to equate scores for.
        bq_client: BigQuery client (created if None).
        fs_client: Firestore client (created if None).

    Returns:
        Dict with equating results.
    """
    if bq_client is None:
        bq_client = bigquery.Client()
    if fs_client is None:
        fs_client = firestore.Client()

    logger.info("Starting score equating for exam: %s", exam_id)

    # Step 1: Load data
    scores_df, responses_df, irt_df = _load_exam_data(bq_client, exam_id)

    if scores_df.empty:
        logger.error("No scores found for exam %s", exam_id)
        return {"exam_id": exam_id, "error": "No scores found"}

    # Step 2: Group by paper variant
    variants = scores_df["paper_variant"].unique()
    scores_by_variant: Dict[str, np.ndarray] = {}
    for variant in variants:
        variant_scores = scores_df[scores_df["paper_variant"] == variant]["raw_score"].values
        scores_by_variant[str(variant)] = variant_scores.astype(np.float64)

    logger.info("Found %d paper variants: %s", len(variants), list(variants))

    # Step 3: KS test
    ks_statistic, ks_p_value, ks_details = cross_paper_ks_test(scores_by_variant)
    equating_needed = ks_details["equating_needed"]

    logger.info(
        "KS test: statistic=%.4f, p_value=%.6f, equating_needed=%s",
        ks_statistic,
        ks_p_value,
        equating_needed,
    )

    # Build IRT param lookup
    irt_lookup: Dict[str, Dict[str, float]] = {}
    for _, row in irt_df.iterrows():
        key = f"{row['template_id']}_{row['instantiation_id']}"
        irt_lookup[key] = {
            "a": float(row["discrimination_a"]),
            "b": float(row["difficulty_b"]),
            "c": float(row["guessing_c"]),
        }

    max_score_adjustment = 0.0

    if equating_needed:
        # Step 4: IRT true-score equating
        logger.info("Applying IRT true-score equating...")

        reference_variant = _select_reference_paper(scores_df)

        # Build reference paper IRT params
        ref_candidates = scores_df[scores_df["paper_variant"] == reference_variant]["candidate_id"]
        ref_cand_id = ref_candidates.iloc[0] if len(ref_candidates) > 0 else None

        # Get questions for reference variant
        if ref_cand_id:
            ref_responses = responses_df[responses_df["candidate_id"] == ref_cand_id]
            reference_params = []
            for _, row in ref_responses.iterrows():
                key = f"{row['template_id']}_{row['instantiation_id']}"
                if key in irt_lookup:
                    reference_params.append(irt_lookup[key])
                else:
                    # Fallback: use default params
                    reference_params.append({"a": 1.0, "b": 0.0, "c": 0.2})
        else:
            # Fallback
            reference_params = [{"a": 1.0, "b": 0.0, "c": 0.2}]

        # For each candidate: estimate theta, compute equated score
        all_responses_dict: Dict[str, np.ndarray] = {}
        all_irt_params_dict: Dict[str, List[Dict[str, float]]] = {}

        for cand_id in scores_df["candidate_id"].unique():
            cand_resp = responses_df[responses_df["candidate_id"] == cand_id].sort_values("question_index")
            binary_responses = cand_resp["correct"].values.astype(np.float64)
            all_responses_dict[str(cand_id)] = binary_responses

            cand_params = []
            for _, row in cand_resp.iterrows():
                key = f"{row['template_id']}_{row['instantiation_id']}"
                if key in irt_lookup:
                    cand_params.append(irt_lookup[key])
                else:
                    cand_params.append({"a": 1.0, "b": 0.0, "c": 0.2})
            all_irt_params_dict[str(cand_id)] = cand_params

        # Batch estimate abilities
        abilities = estimate_abilities_batch(all_responses_dict, all_irt_params_dict)

        # Compute equated scores
        equated_scores: Dict[str, float] = {}
        for cand_id, theta in abilities.items():
            equated = _compute_expected_true_score(theta, reference_params)
            equated_scores[cand_id] = equated

        # Calculate max score adjustment
        for _, row in scores_df.iterrows():
            cand_id = str(row["candidate_id"])
            raw = float(row["raw_score"])
            equated = equated_scores.get(cand_id, raw)
            adjustment = abs(equated - raw)
            if adjustment > max_score_adjustment:
                max_score_adjustment = adjustment
    else:
        # No equating needed: equated score = raw score
        equated_scores = {}
        for _, row in scores_df.iterrows():
            equated_scores[str(row["candidate_id"])] = float(row["raw_score"])

    # Step 5: Write equated scores to BigQuery
    bq_rows = []
    for _, row in scores_df.iterrows():
        cand_id = str(row["candidate_id"])
        raw_score = float(row["raw_score"])
        equated_score = equated_scores.get(cand_id, raw_score)

        bq_rows.append({
            "exam_id": exam_id,
            "candidate_id": cand_id,
            "paper_variant": str(row["paper_variant"]),
            "center_id": str(row["center_id"]),
            "raw_score": raw_score,
            "equated_score": round(equated_score, 4),
            "equating_applied": equating_needed,
            "score_adjustment": round(equated_score - raw_score, 4),
        })

    if bq_rows:
        table_ref = f"{bq_client.project}.{DATASET_ID}.exam_results"
        errors = bq_client.insert_rows_json(table_ref, bq_rows)
        if errors:
            logger.error("BigQuery insert errors: %s", errors)

    # Step 5b: Write to Firestore
    batch = fs_client.batch()
    write_count = 0
    MAX_BATCH = 450

    for cand_id, equated_score in equated_scores.items():
        doc_ref = fs_client.collection("candidates").document(cand_id)
        raw_row = scores_df[scores_df["candidate_id"] == cand_id]
        raw_score = float(raw_row.iloc[0]["raw_score"]) if not raw_row.empty else 0.0

        batch.set(
            doc_ref,
            {
                "result": {
                    "examId": exam_id,
                    "rawScore": raw_score,
                    "equatedScore": round(equated_score, 4),
                    "equatingApplied": equating_needed,
                }
            },
            merge=True,
        )
        write_count += 1

        if write_count >= MAX_BATCH:
            batch.commit()
            batch = fs_client.batch()
            write_count = 0

    if write_count > 0:
        batch.commit()

    result = {
        "exam_id": exam_id,
        "equating_applied": equating_needed,
        "ks_statistic": ks_statistic,
        "p_value": ks_p_value,
        "max_score_adjustment": round(max_score_adjustment, 4),
        "num_candidates": len(scores_df),
        "num_variants": len(variants),
        "ks_details": ks_details,
    }

    logger.info(
        "Score equating complete: exam=%s, equating_applied=%s, "
        "ks_stat=%.4f, p=%.6f, max_adjustment=%.4f, candidates=%d",
        exam_id,
        equating_needed,
        ks_statistic,
        ks_p_value,
        max_score_adjustment,
        len(scores_df),
    )

    return result
