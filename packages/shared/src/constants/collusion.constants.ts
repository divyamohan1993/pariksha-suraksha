/**
 * Collusion detection constants.
 * Calibrated thresholds for the log-likelihood ratio based pairwise collusion test.
 */

/** Target false positive rate for the collusion detection threshold. */
export const COLLUSION_FPR_THRESHOLD = 0.0001 as const;

/** Maximum allowed question overlap fraction between adjacent seats. */
export const MAX_NEIGHBOR_OVERLAP = 0.1 as const;

/** Maximum allowed question overlap fraction across different exam centers. */
export const MAX_CROSS_CENTER_OVERLAP = 0.15 as const;
