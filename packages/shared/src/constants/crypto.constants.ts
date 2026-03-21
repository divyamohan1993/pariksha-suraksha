/**
 * Cryptographic constants for the ParikshaSuraksha exam integrity system.
 */

/** Symmetric encryption algorithm for question blobs. */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;

/** Symmetric key size in bits. */
export const KEY_SIZE = 256 as const;

/** RSA modulus bit length for time-lock puzzles. */
export const TLP_MODULUS_BITS = 4096 as const;

/** Minimum number of Shamir fragments required to reconstruct the per-exam KEK. */
export const SHAMIR_THRESHOLD = 3 as const;

/** Total number of Shamir fragments distributed per exam. */
export const SHAMIR_SHARES = 5 as const;
