"""
Hardware benchmark for TLP squaring rate calibration.

Measures the rate of sequential modular squarings on the current hardware
to calibrate time-lock puzzle parameters. Should be run on the actual
GKE compute node (c2-standard-8) for production accuracy.
"""

import logging
import secrets
import time

from sympy import nextprime

logger = logging.getLogger(__name__)


def _generate_test_modulus(bits: int = 4096) -> int:
    """Generate a test RSA modulus for benchmarking.

    This does NOT need to be a safe prime product; it just needs to be
    the correct bit length for representative squaring performance.

    Args:
        bits: Bit length of the modulus.

    Returns:
        An integer of the specified bit length (product of two primes).
    """
    half_bits = bits // 2
    lower = 1 << (half_bits - 1)
    upper = 1 << half_bits

    p_start = secrets.randbelow(upper - lower) + lower
    q_start = secrets.randbelow(upper - lower) + lower

    p = int(nextprime(p_start))
    q = int(nextprime(q_start))

    n = p * q
    logger.info("Generated %d-bit test modulus for benchmark", n.bit_length())
    return n


def benchmark_squarings(
    modulus_bits: int = 4096,
    duration_seconds: float = 10.0,
) -> int:
    """Benchmark sequential modular squarings on current hardware.

    Performs repeated squarings for the specified duration and returns
    the measured rate. This must be run on the actual compute node where
    TLP puzzles will be solved for accurate calibration.

    Args:
        modulus_bits: Bit length of the test modulus (should match production).
        duration_seconds: How long to run the benchmark.

    Returns:
        Squarings per second (integer).
    """
    logger.info(
        "Starting squaring benchmark: modulus=%d bits, duration=%.1fs",
        modulus_bits,
        duration_seconds,
    )

    n = _generate_test_modulus(modulus_bits)

    # Random starting value
    a = secrets.randbelow(n - 2) + 2

    # Warm up (discard first 1000 squarings)
    val = a
    for _ in range(1000):
        val = pow(val, 2, n)

    # Benchmark
    count = 0
    start_time = time.monotonic()
    deadline = start_time + duration_seconds

    val = a
    while time.monotonic() < deadline:
        # Do squarings in batches of 1000 to reduce timing overhead
        for _ in range(1000):
            val = pow(val, 2, n)
        count += 1000

    elapsed = time.monotonic() - start_time
    squarings_per_sec = int(count / elapsed)

    logger.info(
        "Benchmark complete: %d squarings in %.2fs = %d squarings/sec",
        count,
        elapsed,
        squarings_per_sec,
    )

    return squarings_per_sec
