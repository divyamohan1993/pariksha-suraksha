"""
TLP Puzzle Verifier — verifies that a time-lock puzzle is solvable
and produces the expected key.

Used for testing with small t values (not practical for production-scale puzzles).
"""

import logging
import time

from .tlp import TimeLockPuzzle

logger = logging.getLogger(__name__)


def verify_puzzle_solvable(
    puzzle: TimeLockPuzzle,
    expected_key: bytes,
    max_time_seconds: int = 60,
) -> bool:
    """Verify a time-lock puzzle produces the expected key when solved.

    Actually solves the puzzle by sequential squaring. Only practical for
    testing with small t values (e.g., t < 10_000_000).

    Args:
        puzzle: The time-lock puzzle to verify.
        expected_key: The key that should be recovered.
        max_time_seconds: Maximum allowed time for verification.

    Returns:
        True if the puzzle is solved correctly within the time limit.

    Raises:
        TimeoutError: If solving takes longer than max_time_seconds.
    """
    logger.info(
        "Verifying puzzle: t=%d squarings, max_time=%ds",
        puzzle.t,
        max_time_seconds,
    )

    start_time = time.monotonic()

    # Sequential squaring: compute a^(2^t) mod n
    result = puzzle.a
    for i in range(puzzle.t):
        result = pow(result, 2, puzzle.n)

        # Check timeout every 100,000 iterations
        if i % 100_000 == 0 and i > 0:
            elapsed = time.monotonic() - start_time
            if elapsed > max_time_seconds:
                raise TimeoutError(
                    f"Puzzle verification timed out after {elapsed:.1f}s "
                    f"at iteration {i}/{puzzle.t}"
                )

            progress = i / puzzle.t * 100
            rate = i / elapsed
            eta = (puzzle.t - i) / rate if rate > 0 else float("inf")
            logger.debug(
                "Verification progress: %.1f%% (%d/%d), rate=%.0f sq/s, ETA=%.1fs",
                progress,
                i,
                puzzle.t,
                rate,
                eta,
            )

    elapsed = time.monotonic() - start_time

    # Recover key from puzzle
    key_int = (puzzle.cipher - result) % puzzle.n
    recovered_key = key_int.to_bytes(puzzle.key_size_bytes, "big")

    is_correct = recovered_key == expected_key

    if is_correct:
        logger.info(
            "Puzzle verification PASSED: solved in %.2fs (%d squarings)",
            elapsed,
            puzzle.t,
        )
    else:
        logger.error(
            "Puzzle verification FAILED: recovered key does not match expected key. "
            "Solved in %.2fs",
            elapsed,
        )

    return is_correct
