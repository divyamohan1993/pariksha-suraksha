"""
Distractor Attractiveness Profile computation.

For each question instantiation, computes the probability of selecting each
answer option (A, B, C, D) across all examinees. This profile is used by the
collusion detector to calibrate log-likelihood ratio thresholds.
"""

import numpy as np
from typing import Dict, List
from google.cloud import bigquery


def compute_distractor_profile(
    responses: np.ndarray,
    correct_answer: int,
    num_options: int = 4,
) -> Dict[int, float]:
    """Compute the distractor attractiveness profile for a single question.

    Args:
        responses: Array of shape (N,) containing the selected option index
                   (0=A, 1=B, 2=C, 3=D) for each examinee.
        correct_answer: Index of the correct option (0-3).
        num_options: Number of answer options (default 4).

    Returns:
        Dictionary mapping option index -> selection probability.
        Example: {0: 0.15, 1: 0.60, 2: 0.10, 3: 0.15} where 1 is correct.
    """
    N = len(responses)
    if N == 0:
        return {k: 1.0 / num_options for k in range(num_options)}

    counts = np.zeros(num_options, dtype=np.float64)
    for option in range(num_options):
        counts[option] = np.sum(responses == option)

    # Add Laplace smoothing to avoid zero probabilities
    smoothed_counts = counts + 1.0
    probabilities = smoothed_counts / np.sum(smoothed_counts)

    profile = {k: float(probabilities[k]) for k in range(num_options)}
    return profile


def compute_profiles_for_template(
    responses_by_inst: Dict[str, np.ndarray],
    correct_answers_by_inst: Dict[str, int],
    num_options: int = 4,
) -> Dict[str, Dict[int, float]]:
    """Compute distractor profiles for all instantiations of a template.

    Args:
        responses_by_inst: Dict mapping inst_id -> array of responses (N,)
        correct_answers_by_inst: Dict mapping inst_id -> correct option index
        num_options: Number of answer options

    Returns:
        Dict mapping inst_id -> distractor profile dict
    """
    profiles = {}
    for inst_id, responses in responses_by_inst.items():
        correct = correct_answers_by_inst[inst_id]
        profiles[inst_id] = compute_distractor_profile(responses, correct, num_options)
    return profiles


def write_profiles_to_bigquery(
    client: bigquery.Client,
    dataset_id: str,
    table_id: str,
    template_id: str,
    profiles: Dict[str, Dict[int, float]],
) -> None:
    """Write distractor profiles to BigQuery distractor_profiles table.

    Args:
        client: BigQuery client instance.
        dataset_id: BigQuery dataset ID (e.g., 'pariksha_analytics').
        table_id: Table ID (e.g., 'distractor_profiles').
        template_id: The question template ID.
        profiles: Dict mapping inst_id -> distractor profile.
    """
    table_ref = f"{client.project}.{dataset_id}.{table_id}"

    rows = []
    for inst_id, profile in profiles.items():
        rows.append({
            "template_id": template_id,
            "instantiation_id": inst_id,
            "option_a_prob": profile.get(0, 0.0),
            "option_b_prob": profile.get(1, 0.0),
            "option_c_prob": profile.get(2, 0.0),
            "option_d_prob": profile.get(3, 0.0),
        })

    if rows:
        errors = client.insert_rows_json(table_ref, rows)
        if errors:
            raise RuntimeError(f"BigQuery insert errors: {errors}")
