"""
Threshold calibration for the collusion detector.

Computes the null distribution of the log-likelihood ratio statistic under
the assumption of independent responses, then finds the threshold tau such
that P(log_lambda > tau | independent) < target_fpr.
"""

import logging
import math
from typing import Dict, List, Tuple

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


def simulate_independent_responses(
    num_questions: int,
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int],
    num_candidates: int = 1000,
    rng: np.random.Generator = None,
) -> np.ndarray:
    """Simulate independent candidate responses based on distractor profiles.

    Each simulated candidate independently selects answers according to the
    distractor profile probabilities for each question.

    Args:
        num_questions: Number of questions per paper.
        distractor_profiles: Dict mapping question_index -> probability array.
        correct_answers: Dict mapping question_index -> correct option.
        num_candidates: Number of candidates to simulate.
        rng: Random number generator (for reproducibility).

    Returns:
        Response matrix of shape (num_candidates, max_question_index + 1).
    """
    if rng is None:
        rng = np.random.default_rng(42)

    question_indices = sorted(distractor_profiles.keys())
    max_q = max(question_indices) + 1

    responses = np.zeros((num_candidates, max_q), dtype=np.int32)

    for q in question_indices:
        profile = distractor_profiles[q]
        # Normalize probabilities
        probs = np.array(profile, dtype=np.float64)
        probs = probs / probs.sum()

        # Sample responses independently for all candidates
        responses[:, q] = rng.choice(len(probs), size=num_candidates, p=probs)

    return responses


def compute_null_distribution(
    num_questions: int,
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int],
    num_simulated_pairs: int = 100000,
    num_candidates: int = 2000,
    rng: np.random.Generator = None,
) -> np.ndarray:
    """Compute the null distribution of log-lambda under independence.

    Simulates many candidate pairs with independent responses and computes
    the collusion score for each pair.

    Args:
        num_questions: Number of questions.
        distractor_profiles: Distractor profiles for each question.
        correct_answers: Correct answer for each question.
        num_simulated_pairs: Number of pairs to simulate.
        num_candidates: Number of candidates to simulate.
        rng: Random number generator.

    Returns:
        Array of log-lambda scores under the null hypothesis.
    """
    if rng is None:
        rng = np.random.default_rng(42)

    # Simulate independent responses
    responses = simulate_independent_responses(
        num_questions=num_questions,
        distractor_profiles=distractor_profiles,
        correct_answers=correct_answers,
        num_candidates=num_candidates,
        rng=rng,
    )

    question_indices = sorted(distractor_profiles.keys())
    null_scores = np.zeros(num_simulated_pairs, dtype=np.float64)

    # Randomly pair candidates
    for pair_idx in range(num_simulated_pairs):
        u = rng.integers(0, num_candidates)
        v = rng.integers(0, num_candidates)
        while v == u:
            v = rng.integers(0, num_candidates)

        log_lambda = 0.0
        for q in question_indices:
            r_u = responses[u, q]
            r_v = responses[v, q]
            correct = correct_answers[q]
            profile = distractor_profiles[q]

            if r_u == correct or r_v == correct:
                continue

            p_wrong_total = sum(
                profile[k] for k in range(len(profile)) if k != correct
            )
            p_wrong_total = max(p_wrong_total, 1e-10)

            if r_u == r_v:
                p_k = max(profile[r_u], 1e-10)
                log_lambda += math.log(p_wrong_total / p_k)
            else:
                p_match = sum(
                    profile[k] ** 2 for k in range(len(profile)) if k != correct
                )
                p_diff = p_wrong_total ** 2 - p_match
                p_diff = max(p_diff, 1e-10)
                epsilon = 1e-6
                contribution = math.log(
                    max(p_diff / p_wrong_total ** 2, 1e-10) / epsilon
                )
                log_lambda -= contribution

        null_scores[pair_idx] = log_lambda

    return null_scores


def calibrate_threshold(
    null_distribution_scores: np.ndarray,
    target_fpr: float = 0.0001,
) -> Tuple[float, Dict]:
    """Calibrate the detection threshold for a target false positive rate.

    Finds threshold tau such that P(log_lambda > tau | independent) < target_fpr.

    Args:
        null_distribution_scores: Array of log-lambda scores under the null
                                  hypothesis (independent responses).
        target_fpr: Target false positive rate (default 0.0001 = 0.01%).

    Returns:
        Tuple of (threshold, calibration_info):
            threshold: The calibrated tau value.
            calibration_info: Dict with distribution statistics.
    """
    n = len(null_distribution_scores)
    if n == 0:
        logger.warning("Empty null distribution, using default threshold")
        return 20.0, {"error": "empty_distribution"}

    # Sort scores
    sorted_scores = np.sort(null_distribution_scores)

    # Find the (1 - target_fpr) quantile
    quantile_idx = int(math.ceil((1.0 - target_fpr) * n)) - 1
    quantile_idx = min(quantile_idx, n - 1)
    threshold = float(sorted_scores[quantile_idx])

    # Add safety margin (10% above quantile)
    threshold = threshold * 1.1 if threshold > 0 else threshold + 1.0

    # Compute distribution statistics
    actual_fpr = np.mean(null_distribution_scores > threshold)

    calibration_info = {
        "num_simulated_pairs": n,
        "target_fpr": target_fpr,
        "actual_fpr": float(actual_fpr),
        "threshold": float(threshold),
        "null_mean": float(np.mean(null_distribution_scores)),
        "null_std": float(np.std(null_distribution_scores)),
        "null_median": float(np.median(null_distribution_scores)),
        "null_p95": float(np.percentile(null_distribution_scores, 95)),
        "null_p99": float(np.percentile(null_distribution_scores, 99)),
        "null_p999": float(np.percentile(null_distribution_scores, 99.9)),
        "null_max": float(np.max(null_distribution_scores)),
    }

    logger.info(
        "Calibrated threshold: tau=%.4f for target FPR=%.6f (actual FPR=%.6f)",
        threshold,
        target_fpr,
        actual_fpr,
    )
    logger.info(
        "Null distribution: mean=%.4f, std=%.4f, p99=%.4f, max=%.4f",
        calibration_info["null_mean"],
        calibration_info["null_std"],
        calibration_info["null_p99"],
        calibration_info["null_max"],
    )

    return threshold, calibration_info
