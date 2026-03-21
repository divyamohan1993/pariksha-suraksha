"""
Ability (theta) estimation using Maximum Likelihood Estimation.

For each candidate, estimates latent ability theta from their response
pattern and the IRT parameters of their assigned questions using
Newton-Raphson optimization of the log-likelihood.
"""

import logging
import math
from typing import Dict, List, Tuple

import numpy as np
from scipy.special import expit

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 50
CONVERGENCE_TOLERANCE = 1e-4
THETA_BOUNDS = (-4.0, 4.0)


def _icc_3pl(theta: float, a: float, b: float, c: float) -> float:
    """Compute 3PL ICC probability at a single theta.

    P(X=1 | theta, a, b, c) = c + (1-c) / (1 + exp(-a*(theta-b)))
    """
    z = a * (theta - b)
    return c + (1.0 - c) * float(expit(z))


def estimate_ability(
    responses: np.ndarray,
    irt_params: List[Dict[str, float]],
) -> float:
    """Estimate ability theta via Maximum Likelihood Estimation.

    Uses Newton-Raphson iteration on the log-likelihood of the response
    pattern given 3PL IRT parameters.

    The log-likelihood is:
        L(theta) = sum_j [ x_j * log(P_j) + (1-x_j) * log(1-P_j) ]

    where P_j = c_j + (1-c_j) / (1 + exp(-a_j * (theta - b_j)))

    Args:
        responses: Binary response array of shape (J,) where J is the number
                   of items. 1 = correct, 0 = incorrect.
        irt_params: List of dicts with keys "a", "b", "c" for each item.
                    Must have same length as responses.

    Returns:
        Estimated ability theta (float).

    Raises:
        ValueError: If responses and irt_params have different lengths.
    """
    J = len(responses)
    if J != len(irt_params):
        raise ValueError(
            f"responses ({J}) and irt_params ({len(irt_params)}) must have same length"
        )

    if J == 0:
        return 0.0

    # Initial estimate: logit of proportion correct
    prop_correct = np.clip(np.mean(responses), 0.01, 0.99)
    theta = float(np.log(prop_correct / (1.0 - prop_correct)))
    theta = np.clip(theta, THETA_BOUNDS[0], THETA_BOUNDS[1])

    for iteration in range(MAX_ITERATIONS):
        # Compute gradient (first derivative) and Hessian (second derivative)
        # of the log-likelihood
        gradient = 0.0
        hessian = 0.0

        for j in range(J):
            a_j = irt_params[j]["a"]
            b_j = irt_params[j]["b"]
            c_j = irt_params[j]["c"]
            x_j = float(responses[j])

            # P(correct | theta)
            P_j = _icc_3pl(theta, a_j, b_j, c_j)
            P_j = np.clip(P_j, 1e-10, 1.0 - 1e-10)
            Q_j = 1.0 - P_j

            # P* = logistic (without guessing)
            z = a_j * (theta - b_j)
            P_star = float(expit(z))
            P_star = np.clip(P_star, 1e-10, 1.0 - 1e-10)

            # W_j = a_j * (P*_j - c_j) / ((1 - c_j) * P_j)
            denom = (1.0 - c_j) * P_j
            if abs(denom) < 1e-20:
                continue
            W_j = a_j * (P_star - c_j) / denom

            # Gradient: dL/dtheta = sum_j W_j * P*_j * (1 - P*_j) * (x_j - P_j) / (P_j * Q_j)
            pq = P_j * Q_j
            if abs(pq) < 1e-20:
                continue

            gradient += W_j * P_star * (1.0 - P_star) * (x_j - P_j) / pq

            # Hessian approximation (expected information)
            # I(theta) = -E[d^2L/dtheta^2] ~ sum_j W_j^2 * P*_j^2 * (1-P*_j)^2 / (P_j * Q_j)
            hessian -= (W_j ** 2) * (P_star ** 2) * ((1.0 - P_star) ** 2) / pq

        # Newton-Raphson update
        if abs(hessian) < 1e-20:
            # Hessian too small, use gradient step
            theta += 0.1 * gradient
        else:
            delta = gradient / hessian
            theta -= delta

        # Enforce bounds
        theta = float(np.clip(theta, THETA_BOUNDS[0], THETA_BOUNDS[1]))

        # Check convergence
        if abs(gradient) < CONVERGENCE_TOLERANCE:
            logger.debug(
                "Ability estimation converged at iteration %d: theta=%.4f",
                iteration,
                theta,
            )
            break

    return float(theta)


def estimate_abilities_batch(
    all_responses: Dict[str, np.ndarray],
    all_irt_params: Dict[str, List[Dict[str, float]]],
) -> Dict[str, float]:
    """Estimate ability for a batch of candidates.

    Args:
        all_responses: Dict mapping candidate_id -> binary response array.
        all_irt_params: Dict mapping candidate_id -> list of IRT param dicts
                        for their assigned questions.

    Returns:
        Dict mapping candidate_id -> estimated theta.
    """
    abilities = {}
    total = len(all_responses)

    for idx, (cand_id, responses) in enumerate(all_responses.items()):
        params = all_irt_params.get(cand_id)
        if params is None:
            logger.warning("No IRT params for candidate %s, using theta=0", cand_id)
            abilities[cand_id] = 0.0
            continue

        try:
            theta = estimate_ability(responses, params)
            abilities[cand_id] = theta
        except Exception as e:
            logger.error("Failed to estimate ability for %s: %s", cand_id, str(e))
            abilities[cand_id] = 0.0

        if (idx + 1) % 1000 == 0:
            logger.info("Estimated abilities: %d/%d", idx + 1, total)

    logger.info("Ability estimation complete: %d candidates", len(abilities))
    return abilities
