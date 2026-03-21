"""
3PL IRT Model fitting using Marginal Maximum Likelihood Estimation (MMLE).

The 3-Parameter Logistic (3PL) model:
    P(X=1 | theta, a, b, c) = c + (1 - c) / (1 + exp(-a * (theta - b)))

where:
    a = discrimination parameter
    b = difficulty parameter
    c = guessing (pseudo-chance) parameter
    theta = latent ability
"""

import numpy as np
from scipy.special import expit
from typing import Tuple


# Gauss-Hermite quadrature points for numerical integration over ability distribution
NUM_QUADRATURE_POINTS = 41
MAX_ITERATIONS = 100
CONVERGENCE_TOLERANCE = 1e-6

# Parameter bounds
A_BOUNDS = (0.2, 5.0)
B_BOUNDS = (-4.0, 4.0)
C_BOUNDS = (0.0, 0.35)


def _gauss_hermite_quadrature(num_points: int) -> Tuple[np.ndarray, np.ndarray]:
    """Generate Gauss-Hermite quadrature points and weights for N(0,1) integration."""
    points, weights = np.polynomial.hermite.hermgauss(num_points)
    # Transform from Hermite to standard normal
    points = points * np.sqrt(2)
    weights = weights / np.sqrt(np.pi)
    return points, weights


def _icc_3pl(theta: np.ndarray, a: float, b: float, c: float) -> np.ndarray:
    """Compute the Item Characteristic Curve (ICC) for the 3PL model.

    Args:
        theta: Array of ability values, shape (Q,)
        a: Discrimination parameter
        b: Difficulty parameter
        c: Guessing parameter

    Returns:
        P(X=1 | theta, a, b, c) for each theta value, shape (Q,)
    """
    z = a * (theta - b)
    return c + (1.0 - c) * expit(z)


def _log_likelihood_gradient_hessian(
    responses: np.ndarray,
    a: float,
    b: float,
    c: float,
    posterior_weights: np.ndarray,
    theta_points: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute gradient and Hessian of the marginal log-likelihood w.r.t. item parameters.

    Args:
        responses: Binary response matrix, shape (N,) for a single item
        a, b, c: Current item parameter estimates
        posterior_weights: Posterior weights from E-step, shape (N, Q)
        theta_points: Quadrature points, shape (Q,)

    Returns:
        gradient: Shape (3,) — [dL/da, dL/db, dL/dc]
        hessian: Shape (3, 3) — second derivatives
    """
    N = responses.shape[0]
    Q = theta_points.shape[0]

    # P(theta) for each quadrature point
    P = _icc_3pl(theta_points, a, b, c)  # (Q,)
    P = np.clip(P, 1e-10, 1.0 - 1e-10)

    # P* = logistic part (without guessing)
    z = a * (theta_points - b)
    P_star = expit(z)  # (Q,)
    P_star = np.clip(P_star, 1e-10, 1.0 - 1e-10)

    # W = (P* - c) / ((1 - c) * P) — scaling factor
    W = (P_star - c) / ((1.0 - c) * P)  # (Q,)

    gradient = np.zeros(3)
    hessian = np.zeros((3, 3))

    for k in range(Q):
        p_k = P[k]
        q_k = 1.0 - p_k
        w_k = W[k]
        ps_k = P_star[k]
        qs_k = 1.0 - ps_k
        theta_k = theta_points[k]

        # Expected counts from posterior
        # r_k = sum over persons of posterior_weight[n,k] * x_n
        # f_k = sum over persons of posterior_weight[n,k]
        r_k = np.sum(posterior_weights[:, k] * responses)
        f_k = np.sum(posterior_weights[:, k])

        # Common factor
        diff = r_k - f_k * p_k
        common = w_k * ps_k * qs_k

        # Gradient components
        da = common * (theta_k - b) * diff / (p_k * q_k) if p_k * q_k > 1e-20 else 0.0
        db = -common * a * diff / (p_k * q_k) if p_k * q_k > 1e-20 else 0.0
        dc = diff / ((1.0 - c) * p_k * q_k) if (1.0 - c) * p_k * q_k > 1e-20 else 0.0

        gradient[0] += da
        gradient[1] += db
        gradient[2] += dc

        # Hessian (approximation using Fisher information)
        info_factor = f_k * p_k * q_k
        if info_factor > 1e-20:
            h_aa = -(common * (theta_k - b)) ** 2 * info_factor / (p_k * q_k) ** 2
            h_bb = -(common * a) ** 2 * info_factor / (p_k * q_k) ** 2
            h_cc = -info_factor / ((1.0 - c) * p_k * q_k) ** 2
            h_ab = common**2 * a * (theta_k - b) * info_factor / (p_k * q_k) ** 2
            h_ac = -common * (theta_k - b) * info_factor / ((1.0 - c) * (p_k * q_k) ** 2)
            h_bc = common * a * info_factor / ((1.0 - c) * (p_k * q_k) ** 2)

            hessian[0, 0] += h_aa
            hessian[1, 1] += h_bb
            hessian[2, 2] += h_cc
            hessian[0, 1] += h_ab
            hessian[1, 0] += h_ab
            hessian[0, 2] += h_ac
            hessian[2, 0] += h_ac
            hessian[1, 2] += h_bc
            hessian[2, 1] += h_bc

    return gradient, hessian


def fit_3pl(responses: np.ndarray) -> Tuple[float, float, float]:
    """Fit the 3PL IRT model to binary response data using MMLE with EM.

    Uses the Bock-Aitkin EM algorithm:
    - E-step: Compute posterior ability distributions using quadrature
    - M-step: Update item parameters via Newton-Raphson

    Args:
        responses: Binary response matrix of shape (N,) where N is the number
                   of examinees. 1 = correct, 0 = incorrect.

    Returns:
        Tuple of (a, b, c):
            a: discrimination parameter
            b: difficulty parameter
            c: guessing parameter (pseudo-chance level)
    """
    N = responses.shape[0]
    if N < 10:
        raise ValueError(f"Need at least 10 responses for IRT fitting, got {N}")

    theta_points, quad_weights = _gauss_hermite_quadrature(NUM_QUADRATURE_POINTS)
    Q = len(theta_points)

    # Initial parameter estimates
    p_correct = np.clip(np.mean(responses), 0.05, 0.95)
    a = 1.0  # initial discrimination
    b = -np.log(p_correct / (1.0 - p_correct))  # logit of proportion correct
    c = 0.2 if p_correct > 0.5 else 0.05  # initial guessing

    # Clamp initial values
    a = np.clip(a, A_BOUNDS[0], A_BOUNDS[1])
    b = np.clip(b, B_BOUNDS[0], B_BOUNDS[1])
    c = np.clip(c, C_BOUNDS[0], C_BOUNDS[1])

    prev_log_marginal = -np.inf

    for iteration in range(MAX_ITERATIONS):
        # ---------------------------------------------------------------
        # E-STEP: Compute posterior ability distribution for each examinee
        # ---------------------------------------------------------------
        # P(X_n = x_n | theta_k, a, b, c) for each person n, quadrature point k
        P_theta = _icc_3pl(theta_points, a, b, c)  # (Q,)
        P_theta = np.clip(P_theta, 1e-10, 1.0 - 1e-10)

        # Likelihood of each person's response at each quadrature point
        # L(x_n | theta_k) = P^x_n * (1-P)^(1-x_n)
        # responses shape: (N,), P_theta shape: (Q,)
        # likelihood shape: (N, Q)
        likelihood = np.where(
            responses[:, np.newaxis] == 1,
            P_theta[np.newaxis, :],
            1.0 - P_theta[np.newaxis, :],
        )

        # Prior weights (standard normal via quadrature)
        prior = quad_weights[np.newaxis, :]  # (1, Q)

        # Unnormalized posterior
        unnorm_posterior = likelihood * prior  # (N, Q)

        # Marginal likelihood per person
        marginal = np.sum(unnorm_posterior, axis=1, keepdims=True)  # (N, 1)
        marginal = np.clip(marginal, 1e-300, None)

        # Posterior weights
        posterior_weights = unnorm_posterior / marginal  # (N, Q)

        # Log marginal likelihood (for convergence check)
        log_marginal = np.sum(np.log(np.clip(marginal.ravel(), 1e-300, None)))

        # Check convergence
        if iteration > 0 and abs(log_marginal - prev_log_marginal) < CONVERGENCE_TOLERANCE:
            break
        prev_log_marginal = log_marginal

        # ---------------------------------------------------------------
        # M-STEP: Update item parameters via Newton-Raphson
        # ---------------------------------------------------------------
        gradient, hessian = _log_likelihood_gradient_hessian(
            responses, a, b, c, posterior_weights, theta_points
        )

        # Regularize Hessian for numerical stability
        hessian_reg = hessian - 1e-4 * np.eye(3)

        # Newton-Raphson update
        try:
            delta = np.linalg.solve(hessian_reg, gradient)
        except np.linalg.LinAlgError:
            # Fallback to gradient ascent with small step
            delta = 0.01 * gradient

        # Damped update (step size control)
        step_size = 1.0
        for _ in range(10):
            a_new = a - step_size * delta[0]
            b_new = b - step_size * delta[1]
            c_new = c - step_size * delta[2]

            # Enforce bounds
            a_new = np.clip(a_new, A_BOUNDS[0], A_BOUNDS[1])
            b_new = np.clip(b_new, B_BOUNDS[0], B_BOUNDS[1])
            c_new = np.clip(c_new, C_BOUNDS[0], C_BOUNDS[1])

            # Accept if parameters are reasonable
            if A_BOUNDS[0] <= a_new <= A_BOUNDS[1]:
                break
            step_size *= 0.5

        a, b, c = a_new, b_new, c_new

    return float(a), float(b), float(c)


def verify_isomorphic_equivalence(
    params_by_inst: dict,
    epsilon_a: float = 0.3,
    epsilon_b: float = 0.15,
    epsilon_c: float = 0.05,
) -> Tuple[bool, dict]:
    """Verify all instantiations of a template have equivalent IRT parameters.

    Args:
        params_by_inst: Dict mapping instantiation_id -> (a, b, c) tuple
        epsilon_a: Maximum allowed range for discrimination
        epsilon_b: Maximum allowed range for difficulty
        epsilon_c: Maximum allowed range for guessing

    Returns:
        Tuple of (is_equivalent, details):
            is_equivalent: True if all instantiations are within tolerance
            details: Dict with ranges and flags for each parameter
    """
    if len(params_by_inst) < 2:
        return True, {"message": "Single instantiation, equivalence trivially satisfied"}

    a_vals = [p[0] for p in params_by_inst.values()]
    b_vals = [p[1] for p in params_by_inst.values()]
    c_vals = [p[2] for p in params_by_inst.values()]

    a_range = max(a_vals) - min(a_vals)
    b_range = max(b_vals) - min(b_vals)
    c_range = max(c_vals) - min(c_vals)

    is_equivalent = (
        a_range < epsilon_a
        and b_range < epsilon_b
        and c_range < epsilon_c
    )

    details = {
        "a_range": a_range,
        "b_range": b_range,
        "c_range": c_range,
        "a_within_tolerance": a_range < epsilon_a,
        "b_within_tolerance": b_range < epsilon_b,
        "c_within_tolerance": c_range < epsilon_c,
        "a_mean": float(np.mean(a_vals)),
        "b_mean": float(np.mean(b_vals)),
        "c_mean": float(np.mean(c_vals)),
        "a_std": float(np.std(a_vals)),
        "b_std": float(np.std(b_vals)),
        "c_std": float(np.std(c_vals)),
    }

    return is_equivalent, details
