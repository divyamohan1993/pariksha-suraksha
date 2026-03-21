"""
Collusion Detector — Log-likelihood ratio based pairwise collusion scoring.

Implements the statistic from the design spec with both positive evidence
(same wrong answer) and negative evidence (different wrong answers) per
addendum Fix 10.
"""

import logging
import math
from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CollusionResult:
    """Result of a pairwise collusion analysis."""
    candidate_u: str
    candidate_v: str
    log_lambda: float
    threshold: float
    flagged: bool
    num_shared_questions: int
    num_same_wrong: int
    num_diff_wrong: int
    evidence_details: List[Dict]


def compute_collusion_score(
    responses_u: np.ndarray,
    responses_v: np.ndarray,
    shared_questions: List[int],
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int],
) -> Tuple[float, int, int, List[Dict]]:
    """Compute log-likelihood ratio for candidate pair (u, v).

    Implements both positive evidence (same wrong answer, evidence FOR collusion)
    and negative evidence (different wrong answers, evidence AGAINST collusion)
    as specified in addendum Fix 10.

    The statistic is:
        Lambda = Product over shared questions q where both wrong:
            - Same wrong (r_u == r_v == k): p_wrong_total / p_k
            - Different wrong (r_u != r_v):  -(log(p_diff / p_wrong_total^2) - log(epsilon))

    Args:
        responses_u: Response array for candidate u. Entry at index q is the
                     selected option (0-3) for question q.
        responses_v: Response array for candidate v.
        shared_questions: List of question indices shared between u and v.
        distractor_profiles: Dict mapping question index -> array of option
                             probabilities [p_A, p_B, p_C, p_D].
        correct_answers: Dict mapping question index -> correct option (0-3).

    Returns:
        Tuple of (log_lambda, num_same_wrong, num_diff_wrong, evidence_details).
    """
    log_lambda = 0.0
    num_same_wrong = 0
    num_diff_wrong = 0
    evidence_details = []

    for q in shared_questions:
        r_u = int(responses_u[q])
        r_v = int(responses_v[q])
        correct = correct_answers[q]
        profile = distractor_profiles[q]

        # Skip if either candidate got it correct
        if r_u == correct or r_v == correct:
            continue

        # Compute probability of selecting any wrong answer
        p_wrong_total = sum(
            profile[k] for k in range(len(profile)) if k != correct
        )
        p_wrong_total = max(p_wrong_total, 1e-10)

        if r_u == r_v:
            # Same wrong answer — evidence FOR collusion
            p_k = max(profile[r_u], 1e-10)
            contribution = math.log(p_wrong_total / p_k)
            log_lambda += contribution
            num_same_wrong += 1

            evidence_details.append({
                "question": q,
                "type": "same_wrong",
                "answer": r_u,
                "p_k": float(p_k),
                "p_wrong_total": float(p_wrong_total),
                "contribution": float(contribution),
            })
        else:
            # Different wrong answers — evidence AGAINST collusion
            # P(match) under independence = sum(p_k^2) for wrong options
            p_match = sum(
                profile[k] ** 2 for k in range(len(profile)) if k != correct
            )
            p_diff = p_wrong_total ** 2 - p_match
            p_diff = max(p_diff, 1e-10)

            # Under collusion: P(different wrong) ~ epsilon (very small)
            # Under independence: P(different wrong) = p_diff / p_wrong_total^2
            epsilon = 1e-6
            contribution = math.log(
                max(p_diff / p_wrong_total ** 2, 1e-10) / epsilon
            )
            log_lambda -= contribution
            num_diff_wrong += 1

            evidence_details.append({
                "question": q,
                "type": "diff_wrong",
                "answer_u": r_u,
                "answer_v": r_v,
                "p_diff_norm": float(p_diff / p_wrong_total ** 2),
                "contribution": float(-contribution),
            })

    return log_lambda, num_same_wrong, num_diff_wrong, evidence_details


def detect_collusion(
    exam_id: str,
    center_id: str,
    candidate_ids: List[str],
    candidate_responses: Dict[str, np.ndarray],
    shared_questions_map: Dict[Tuple[str, str], List[int]],
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int],
    threshold: float,
) -> List[CollusionResult]:
    """Detect collusion for all candidate pairs at a center.

    Args:
        exam_id: The exam identifier.
        center_id: The testing center identifier.
        candidate_ids: List of candidate IDs at this center.
        candidate_responses: Dict mapping candidate_id -> response array.
        shared_questions_map: Dict mapping (cand_u, cand_v) -> list of
                             shared question indices. If None, all candidates
                             share the same questions.
        distractor_profiles: Dict mapping question_index -> probability array.
        correct_answers: Dict mapping question_index -> correct option.
        threshold: Log-likelihood ratio threshold for flagging (calibrated for FPR < 0.0001).

    Returns:
        List of CollusionResult for flagged pairs.
    """
    n_candidates = len(candidate_ids)
    total_pairs = n_candidates * (n_candidates - 1) // 2
    logger.info(
        "Running collusion detection for exam=%s, center=%s: %d candidates, %d pairs",
        exam_id,
        center_id,
        n_candidates,
        total_pairs,
    )

    flagged_results: List[CollusionResult] = []
    pairs_checked = 0

    for i in range(n_candidates):
        for j in range(i + 1, n_candidates):
            cand_u = candidate_ids[i]
            cand_v = candidate_ids[j]

            responses_u = candidate_responses.get(cand_u)
            responses_v = candidate_responses.get(cand_v)

            if responses_u is None or responses_v is None:
                continue

            # Determine shared questions
            pair_key = (cand_u, cand_v)
            if pair_key in shared_questions_map:
                shared = shared_questions_map[pair_key]
            elif (cand_v, cand_u) in shared_questions_map:
                shared = shared_questions_map[(cand_v, cand_u)]
            else:
                # If no explicit mapping, assume same paper (all questions shared)
                shared = list(correct_answers.keys())

            if not shared:
                continue

            log_lambda, same_wrong, diff_wrong, evidence = compute_collusion_score(
                responses_u=responses_u,
                responses_v=responses_v,
                shared_questions=shared,
                distractor_profiles=distractor_profiles,
                correct_answers=correct_answers,
            )

            is_flagged = log_lambda > threshold

            if is_flagged:
                result = CollusionResult(
                    candidate_u=cand_u,
                    candidate_v=cand_v,
                    log_lambda=log_lambda,
                    threshold=threshold,
                    flagged=True,
                    num_shared_questions=len(shared),
                    num_same_wrong=same_wrong,
                    num_diff_wrong=diff_wrong,
                    evidence_details=evidence,
                )
                flagged_results.append(result)

                logger.info(
                    "Flagged pair: (%s, %s) log_lambda=%.4f > threshold=%.4f, "
                    "same_wrong=%d, diff_wrong=%d",
                    cand_u,
                    cand_v,
                    log_lambda,
                    threshold,
                    same_wrong,
                    diff_wrong,
                )

            pairs_checked += 1
            if pairs_checked % 10000 == 0:
                logger.info(
                    "Progress: %d/%d pairs checked, %d flagged",
                    pairs_checked,
                    total_pairs,
                    len(flagged_results),
                )

    logger.info(
        "Collusion detection complete: %d/%d pairs flagged out of %d checked",
        len(flagged_results),
        total_pairs,
        pairs_checked,
    )

    return flagged_results
