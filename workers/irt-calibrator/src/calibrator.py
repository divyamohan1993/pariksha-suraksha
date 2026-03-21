"""
IRT Calibration pipeline for question templates.

For each template:
1. Load field test responses from BigQuery
2. Fit 3PL IRT model per instantiation
3. Verify isomorphic equivalence across instantiations
4. Compute distractor attractiveness profiles
5. Write results to BigQuery + Firestore
6. Flag non-equivalent instantiations for removal
"""

import logging
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd
from google.cloud import bigquery, firestore

from .irt_model import fit_3pl, verify_isomorphic_equivalence
from .distractor_profile import (
    compute_distractor_profile,
    compute_profiles_for_template,
    write_profiles_to_bigquery,
)

logger = logging.getLogger(__name__)

DATASET_ID = "pariksha_analytics"
FIELD_TEST_TABLE = "field_test_responses"
IRT_PARAMS_TABLE = "irt_parameters"
DISTRACTOR_TABLE = "distractor_profiles"


def _load_field_test_data(
    bq_client: bigquery.Client, template_id: str
) -> pd.DataFrame:
    """Load field test response data for a template from BigQuery.

    Returns DataFrame with columns:
        candidate_id, template_id, instantiation_id, response, correct, time_spent
    """
    query = f"""
        SELECT
            candidate_id,
            template_id,
            instantiation_id,
            response,
            correct,
            time_spent
        FROM `{bq_client.project}.{DATASET_ID}.{FIELD_TEST_TABLE}`
        WHERE template_id = @template_id
        ORDER BY candidate_id, instantiation_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("template_id", "STRING", template_id)
        ]
    )
    df = bq_client.query(query, job_config=job_config).to_dataframe()
    logger.info(
        "Loaded %d field test responses for template %s", len(df), template_id
    )
    return df


def _write_irt_params_to_bigquery(
    bq_client: bigquery.Client,
    template_id: str,
    params_by_inst: Dict[str, Tuple[float, float, float]],
) -> None:
    """Write fitted IRT parameters to BigQuery irt_parameters table."""
    table_ref = f"{bq_client.project}.{DATASET_ID}.{IRT_PARAMS_TABLE}"

    rows = []
    for inst_id, (a, b, c) in params_by_inst.items():
        rows.append({
            "template_id": template_id,
            "instantiation_id": inst_id,
            "discrimination_a": a,
            "difficulty_b": b,
            "guessing_c": c,
        })

    if rows:
        errors = bq_client.insert_rows_json(table_ref, rows)
        if errors:
            raise RuntimeError(f"BigQuery insert errors for IRT params: {errors}")

    logger.info(
        "Wrote IRT params for %d instantiations of template %s",
        len(rows),
        template_id,
    )


def _write_irt_params_to_firestore(
    fs_client: firestore.Client,
    template_id: str,
    params_by_inst: Dict[str, Tuple[float, float, float]],
    equivalence_result: Tuple[bool, dict],
    flagged_instantiations: List[str],
) -> None:
    """Write IRT parameters and equivalence status to Firestore."""
    is_equivalent, details = equivalence_result

    # Write template-level IRT summary
    template_ref = fs_client.collection("questions").document(template_id)
    template_ref.set(
        {
            "irtParams": {
                "aMean": details.get("a_mean", 0.0),
                "aStd": details.get("a_std", 0.0),
                "bMean": details.get("b_mean", 0.0),
                "bStd": details.get("b_std", 0.0),
                "cMean": details.get("c_mean", 0.0),
                "cStd": details.get("c_std", 0.0),
            },
            "metadata.calibrationDate": firestore.SERVER_TIMESTAMP,
            "metadata.isomorphicEquivalent": is_equivalent,
            "metadata.flaggedInstantiations": flagged_instantiations,
        },
        merge=True,
    )

    # Write per-instantiation IRT params
    for inst_id, (a, b, c) in params_by_inst.items():
        inst_ref = template_ref.collection("instantiations").document(inst_id)
        inst_ref.set(
            {
                "irt": {"a": a, "b": b, "c": c},
                "flagged": inst_id in flagged_instantiations,
            },
            merge=True,
        )

    logger.info(
        "Wrote IRT params to Firestore for template %s (equivalent=%s, flagged=%d)",
        template_id,
        is_equivalent,
        len(flagged_instantiations),
    )


def _identify_flagged_instantiations(
    params_by_inst: Dict[str, Tuple[float, float, float]],
    epsilon_a: float = 0.3,
    epsilon_b: float = 0.15,
    epsilon_c: float = 0.05,
) -> List[str]:
    """Identify instantiations that deviate significantly from the median parameters.

    Flags any instantiation where parameters are outside tolerance of the median.
    """
    if len(params_by_inst) < 2:
        return []

    a_vals = np.array([p[0] for p in params_by_inst.values()])
    b_vals = np.array([p[1] for p in params_by_inst.values()])
    c_vals = np.array([p[2] for p in params_by_inst.values()])

    a_median = np.median(a_vals)
    b_median = np.median(b_vals)
    c_median = np.median(c_vals)

    flagged = []
    for inst_id, (a, b, c) in params_by_inst.items():
        if (
            abs(a - a_median) > epsilon_a / 2.0
            or abs(b - b_median) > epsilon_b / 2.0
            or abs(c - c_median) > epsilon_c / 2.0
        ):
            flagged.append(inst_id)
            logger.warning(
                "Flagging instantiation %s: a=%.3f (med=%.3f), b=%.3f (med=%.3f), c=%.3f (med=%.3f)",
                inst_id,
                a,
                a_median,
                b,
                b_median,
                c,
                c_median,
            )

    return flagged


def calibrate_template(
    template_id: str,
    bq_client: Optional[bigquery.Client] = None,
    fs_client: Optional[firestore.Client] = None,
) -> Dict:
    """Run the full IRT calibration pipeline for a question template.

    Args:
        template_id: The question template ID to calibrate.
        bq_client: BigQuery client (created if None).
        fs_client: Firestore client (created if None).

    Returns:
        Dict with calibration results:
            - template_id
            - num_instantiations
            - is_equivalent
            - params_by_inst
            - flagged_instantiations
            - equivalence_details
    """
    if bq_client is None:
        bq_client = bigquery.Client()
    if fs_client is None:
        fs_client = firestore.Client()

    # Step 1: Load field test responses
    df = _load_field_test_data(bq_client, template_id)
    if df.empty:
        logger.error("No field test data found for template %s", template_id)
        return {
            "template_id": template_id,
            "error": "No field test data found",
            "num_instantiations": 0,
        }

    # Step 2: Fit 3PL model for each instantiation
    instantiation_ids = df["instantiation_id"].unique()
    params_by_inst: Dict[str, Tuple[float, float, float]] = {}

    for inst_id in instantiation_ids:
        inst_df = df[df["instantiation_id"] == inst_id]
        responses = inst_df["correct"].values.astype(np.float64)

        if len(responses) < 10:
            logger.warning(
                "Skipping instantiation %s: only %d responses (need >= 10)",
                inst_id,
                len(responses),
            )
            continue

        try:
            a, b, c = fit_3pl(responses)
            params_by_inst[inst_id] = (a, b, c)
            logger.info(
                "Template %s, inst %s: a=%.3f, b=%.3f, c=%.3f",
                template_id,
                inst_id,
                a,
                b,
                c,
            )
        except Exception as e:
            logger.error(
                "Failed to fit IRT model for template %s, inst %s: %s",
                template_id,
                inst_id,
                str(e),
            )

    if not params_by_inst:
        logger.error("No instantiations successfully calibrated for template %s", template_id)
        return {
            "template_id": template_id,
            "error": "All instantiation fits failed",
            "num_instantiations": 0,
        }

    # Step 3: Verify isomorphic equivalence
    is_equivalent, equivalence_details = verify_isomorphic_equivalence(params_by_inst)
    logger.info(
        "Template %s equivalence check: %s (a_range=%.3f, b_range=%.3f, c_range=%.3f)",
        template_id,
        is_equivalent,
        equivalence_details["a_range"],
        equivalence_details["b_range"],
        equivalence_details["c_range"],
    )

    # Step 4: Compute distractor attractiveness profiles
    responses_by_inst: Dict[str, np.ndarray] = {}
    correct_by_inst: Dict[str, int] = {}

    for inst_id in params_by_inst:
        inst_df = df[df["instantiation_id"] == inst_id]
        responses_by_inst[inst_id] = inst_df["response"].values.astype(np.int32)
        # Determine correct answer index from the data
        correct_rows = inst_df[inst_df["correct"] == 1]
        if not correct_rows.empty:
            correct_by_inst[inst_id] = int(correct_rows.iloc[0]["response"])
        else:
            correct_by_inst[inst_id] = 0  # fallback

    distractor_profiles = compute_profiles_for_template(
        responses_by_inst, correct_by_inst
    )

    # Step 5: Write to BigQuery + Firestore
    _write_irt_params_to_bigquery(bq_client, template_id, params_by_inst)
    write_profiles_to_bigquery(
        bq_client, DATASET_ID, DISTRACTOR_TABLE, template_id, distractor_profiles
    )

    # Write distractor profiles to Firestore as well
    fs_questions = fs_client.collection("questions").document(template_id)
    for inst_id, profile in distractor_profiles.items():
        inst_ref = fs_questions.collection("instantiations").document(inst_id)
        inst_ref.set(
            {"distractorProfile": {chr(65 + k): v for k, v in profile.items()}},
            merge=True,
        )

    # Step 6: Flag non-equivalent instantiations
    flagged = _identify_flagged_instantiations(params_by_inst)

    _write_irt_params_to_firestore(
        fs_client,
        template_id,
        params_by_inst,
        (is_equivalent, equivalence_details),
        flagged,
    )

    result = {
        "template_id": template_id,
        "num_instantiations": len(params_by_inst),
        "is_equivalent": is_equivalent,
        "params_by_inst": {
            k: {"a": v[0], "b": v[1], "c": v[2]} for k, v in params_by_inst.items()
        },
        "flagged_instantiations": flagged,
        "equivalence_details": equivalence_details,
    }

    return result
