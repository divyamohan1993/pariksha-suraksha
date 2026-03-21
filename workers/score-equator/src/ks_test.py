"""
Cross-paper Kolmogorov-Smirnov tests for detecting score distribution differences.

Performs pairwise KS tests between score distributions of different paper
variants to determine whether equating is needed. Uses Bonferroni correction
for multiple comparisons.
"""

import logging
from itertools import combinations
from typing import Dict, Tuple

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


def cross_paper_ks_test(
    scores_by_variant: Dict[str, np.ndarray],
    alpha: float = 0.05,
) -> Tuple[float, float, Dict]:
    """Perform pairwise KS tests between all paper variant score distributions.

    Uses the two-sample Kolmogorov-Smirnov test to detect whether different
    paper variants have statistically different score distributions (suggesting
    different difficulty levels requiring equating).

    Applies Bonferroni correction for multiple comparisons.

    Args:
        scores_by_variant: Dict mapping variant_id -> array of raw scores.
        alpha: Significance level before correction (default 0.05).

    Returns:
        Tuple of (max_statistic, min_p_value, details):
            max_statistic: The largest KS statistic across all pairs.
            min_p_value: The smallest Bonferroni-corrected p-value.
            details: Dict with per-pair test results and summary.
    """
    variant_ids = sorted(scores_by_variant.keys())
    num_variants = len(variant_ids)

    if num_variants < 2:
        logger.info("Only %d variant(s), no pairwise comparison needed", num_variants)
        return 0.0, 1.0, {
            "num_variants": num_variants,
            "num_comparisons": 0,
            "equating_needed": False,
        }

    # Number of pairwise comparisons
    num_comparisons = num_variants * (num_variants - 1) // 2
    bonferroni_alpha = alpha / num_comparisons

    logger.info(
        "Running %d pairwise KS tests across %d variants (Bonferroni alpha=%.6f)",
        num_comparisons,
        num_variants,
        bonferroni_alpha,
    )

    max_statistic = 0.0
    min_p_value = 1.0
    pairwise_results = []

    for var_a, var_b in combinations(variant_ids, 2):
        scores_a = scores_by_variant[var_a]
        scores_b = scores_by_variant[var_b]

        if len(scores_a) < 2 or len(scores_b) < 2:
            logger.warning(
                "Skipping pair (%s, %s): insufficient samples (%d, %d)",
                var_a,
                var_b,
                len(scores_a),
                len(scores_b),
            )
            continue

        # Two-sample KS test
        ks_stat, p_value = stats.ks_2samp(scores_a, scores_b)

        # Bonferroni-corrected p-value
        corrected_p = min(p_value * num_comparisons, 1.0)

        significant = corrected_p < alpha

        pair_result = {
            "variant_a": var_a,
            "variant_b": var_b,
            "n_a": len(scores_a),
            "n_b": len(scores_b),
            "ks_statistic": float(ks_stat),
            "raw_p_value": float(p_value),
            "corrected_p_value": float(corrected_p),
            "significant": significant,
            "mean_a": float(np.mean(scores_a)),
            "mean_b": float(np.mean(scores_b)),
            "std_a": float(np.std(scores_a)),
            "std_b": float(np.std(scores_b)),
            "mean_diff": float(abs(np.mean(scores_a) - np.mean(scores_b))),
        }
        pairwise_results.append(pair_result)

        if ks_stat > max_statistic:
            max_statistic = ks_stat
        if corrected_p < min_p_value:
            min_p_value = corrected_p

        if significant:
            logger.info(
                "Significant difference: %s vs %s (KS=%.4f, corrected p=%.6f, "
                "mean_a=%.2f, mean_b=%.2f)",
                var_a,
                var_b,
                ks_stat,
                corrected_p,
                np.mean(scores_a),
                np.mean(scores_b),
            )

    equating_needed = min_p_value < alpha
    num_significant = sum(1 for r in pairwise_results if r["significant"])

    details = {
        "num_variants": num_variants,
        "num_comparisons": num_comparisons,
        "bonferroni_alpha": bonferroni_alpha,
        "max_statistic": float(max_statistic),
        "min_p_value": float(min_p_value),
        "equating_needed": equating_needed,
        "num_significant_pairs": num_significant,
        "pairwise_results": pairwise_results,
    }

    logger.info(
        "KS test summary: max_stat=%.4f, min_p=%.6f, equating_needed=%s, "
        "significant_pairs=%d/%d",
        max_statistic,
        min_p_value,
        equating_needed,
        num_significant,
        num_comparisons,
    )

    return float(max_statistic), float(min_p_value), details
