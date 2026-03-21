/**
 * IRT (Item Response Theory) calibration constants.
 * Used to verify isomorphic equivalence across parameter instantiations
 * of the same question template.
 */

/** Maximum allowed range of discrimination (a) parameter across instantiations. */
export const EPSILON_A = 0.3 as const;

/** Maximum allowed range of difficulty (b) parameter across instantiations. */
export const EPSILON_B = 0.15 as const;

/** Maximum allowed range of guessing (c) parameter across instantiations. */
export const EPSILON_C = 0.05 as const;

/** Minimum number of field test responses required before IRT calibration is valid. */
export const MIN_FIELD_TEST_COUNT = 200 as const;
