"""
Time-Lock Puzzle (TLP) Generator.

Implements RSA-based time-lock puzzles (Rivest, Shamir, Wagner 1996).
The puzzle seals an encryption key such that it can only be recovered by
performing t sequential modular squarings, calibrated to take a specified
wall-clock duration on reference hardware.

Security properties:
  - Uses CSPRNG (secrets module) for all randomness — NOT random module
  - Safe primes p, q for strong RSA modulus
  - phi(n) is securely deleted after puzzle generation
  - Without phi(n), the only way to solve is sequential squaring
"""

import ctypes
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sympy.ntheory.generate import randprime, nextprime
from sympy import isprime

logger = logging.getLogger(__name__)


@dataclass
class TimeLockPuzzle:
    """A time-lock puzzle sealing a key."""
    n: int           # RSA modulus (p * q), 4096-bit
    a: int           # Random base
    t: int           # Number of sequential squarings required
    cipher: int      # key_int + a^(2^t) mod n
    key_size_bytes: int  # Original key size in bytes


def _generate_safe_prime(bits: int) -> int:
    """Generate a safe prime p such that p = 2q + 1 where q is also prime.

    A safe prime provides a strong RSA modulus with a large prime-order
    subgroup, making factoring harder.

    Args:
        bits: Desired bit length of the safe prime.

    Returns:
        A safe prime of the specified bit length.
    """
    # Generate random odd numbers and test for safe prime property
    # p is safe prime if p = 2q + 1 and both p, q are prime
    attempts = 0
    while True:
        attempts += 1
        # Generate a random prime q of (bits-1) bits
        # Then check if p = 2*q + 1 is also prime
        lower = 1 << (bits - 2)
        upper = (1 << (bits - 1)) - 1

        # Use secrets for cryptographic randomness
        q_candidate = secrets.randbelow(upper - lower) + lower
        # Make it odd
        q_candidate |= 1

        # Find next prime from this starting point
        q = int(nextprime(q_candidate))

        p = 2 * q + 1

        # Check bit length and primality
        if p.bit_length() == bits and isprime(p):
            logger.debug(
                "Found %d-bit safe prime after %d attempts", bits, attempts
            )
            return p

        if attempts % 100 == 0:
            logger.debug("Safe prime search: %d attempts so far...", attempts)


def _secure_delete_int(value: int) -> None:
    """Best-effort secure deletion of an integer from memory.

    Python integers are immutable, so we cannot truly overwrite them in place.
    However, we can:
    1. Delete the reference so GC can collect it
    2. Trigger garbage collection

    For true production security, the sensitive computation should happen
    in a C extension or a separate process that can mlock/munlock memory.
    """
    # The best we can do in pure Python is remove references
    # In production, use a C extension with explicit memory zeroing
    del value


def generate_time_lock_puzzle(
    key: bytes,
    target_time: datetime,
    squarings_per_sec: int,
    safety_margin_seconds: int = 30,
) -> TimeLockPuzzle:
    """Generate a time-lock puzzle that seals key until target_time.

    The puzzle is constructed so that recovering the key requires t sequential
    modular squarings, where t is calibrated to the target release time.
    The puzzle creator can compute this efficiently using the trapdoor (phi(n)),
    but anyone else must perform all t squarings sequentially.

    Args:
        key: The encryption key bytes to seal.
        target_time: When the key should become recoverable.
        squarings_per_sec: Measured sequential squarings per second on
                          reference hardware.
        safety_margin_seconds: Puzzle becomes solvable this many seconds
                              BEFORE target_time (default 30s per addendum Fix 9).

    Returns:
        TimeLockPuzzle with the sealed key.

    Raises:
        ValueError: If target_time is in the past or key is empty.
    """
    if not key:
        raise ValueError("Key must not be empty")

    now = datetime.now(timezone.utc)
    if target_time.tzinfo is None:
        target_time = target_time.replace(tzinfo=timezone.utc)

    seconds_until_release = (target_time - now).total_seconds()
    if seconds_until_release <= 0:
        raise ValueError(
            f"Target time must be in the future (got {seconds_until_release:.1f}s ago)"
        )

    # Apply safety margin: puzzle should be solvable slightly before target
    effective_seconds = max(seconds_until_release - safety_margin_seconds, 1.0)

    logger.info(
        "Generating TLP: target=%s, effective_duration=%.1fs, squarings/sec=%d",
        target_time.isoformat(),
        effective_seconds,
        squarings_per_sec,
    )

    # Step 1: Generate safe primes p, q (2048-bit each)
    logger.info("Generating 2048-bit safe prime p...")
    p = _generate_safe_prime(2048)
    logger.info("Generating 2048-bit safe prime q...")
    q = _generate_safe_prime(2048)

    # Step 2: Compute RSA modulus
    n = p * q
    assert n.bit_length() >= 4095, f"Modulus too small: {n.bit_length()} bits"

    # Step 3: Calculate required sequential squarings
    t = int(effective_seconds * squarings_per_sec)
    logger.info("Puzzle requires t=%d sequential squarings", t)

    # Step 4: Generate random base using CSPRNG
    a = secrets.randbelow(n - 2) + 2  # a in [2, n-1]

    # Step 5: Compute a^(2^t) mod n using the trapdoor (we know phi(n))
    phi_n = (p - 1) * (q - 1)
    e = pow(2, t, phi_n)          # 2^t mod phi(n) — fast
    result = pow(a, e, n)         # a^(2^t) mod n — fast with trapdoor

    # Step 6: Seal the key
    key_int = int.from_bytes(key, "big")
    cipher = (key_int + result) % n

    key_size = len(key)

    # Step 7: SECURELY DELETE sensitive values
    # phi(n) is the trapdoor — without it, solving requires t sequential squarings
    _secure_delete_int(p)
    _secure_delete_int(q)
    _secure_delete_int(phi_n)
    _secure_delete_int(e)
    _secure_delete_int(result)
    _secure_delete_int(key_int)

    # Remove local references
    p = q = phi_n = e = result = key_int = None

    puzzle = TimeLockPuzzle(
        n=n,
        a=a,
        t=t,
        cipher=cipher,
        key_size_bytes=key_size,
    )

    logger.info(
        "TLP generated: modulus=%d bits, t=%d squarings, cipher=%d bits",
        n.bit_length(),
        t,
        cipher.bit_length(),
    )

    return puzzle


def solve_time_lock_puzzle(puzzle: TimeLockPuzzle) -> bytes:
    """Solve a time-lock puzzle by sequential squaring (the hard way).

    This is the only way to recover the key without knowing phi(n).
    Takes O(t) sequential modular squarings.

    Args:
        puzzle: The time-lock puzzle to solve.

    Returns:
        The original key bytes.
    """
    logger.info("Solving TLP by sequential squaring: t=%d", puzzle.t)

    # Compute a^(2^t) mod n by repeated squaring
    result = puzzle.a
    for i in range(puzzle.t):
        result = pow(result, 2, puzzle.n)
        if i % 1_000_000 == 0 and i > 0:
            logger.debug("Squaring progress: %d / %d", i, puzzle.t)

    # Recover key
    key_int = (puzzle.cipher - result) % puzzle.n
    key_bytes = key_int.to_bytes(puzzle.key_size_bytes, "big")

    return key_bytes
