/**
 * Exam lifecycle constants.
 */

/** Interval between automatic response checkpoints during the exam (milliseconds). */
export const CHECKPOINT_INTERVAL_MS = 30000 as const;

/** Number of days to retain encryption keys after exam results are published. */
export const KEY_RETENTION_DAYS = 90 as const;
