/**
 * GF(256) finite field arithmetic for Shamir's Secret Sharing.
 *
 * Uses the irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11B),
 * which is the same polynomial used in AES (Rijndael).
 *
 * All operations are over the Galois Field GF(2^8), where:
 * - Addition is XOR
 * - Multiplication uses carry-less multiplication with reduction modulo the polynomial
 * - Division is multiplication by the multiplicative inverse
 *
 * Precomputed log/exp tables for O(1) multiplication and inversion.
 */

/** Irreducible polynomial: x^8 + x^4 + x^3 + x + 1 */
const IRREDUCIBLE_POLY = 0x11b;

/** Primitive element (generator) for GF(256) */
const GENERATOR = 0x03;

/**
 * Precomputed exponential table: EXP_TABLE[i] = GENERATOR^i mod poly.
 * EXP_TABLE[255] wraps around so that EXP_TABLE[255] = EXP_TABLE[0] = 1.
 * Extended to 512 entries for convenient modular lookups.
 */
const EXP_TABLE: number[] = new Array(512);

/**
 * Precomputed logarithm table: LOG_TABLE[x] = i such that GENERATOR^i = x.
 * LOG_TABLE[0] is undefined (log of 0 is not defined in GF(256)).
 */
const LOG_TABLE: number[] = new Array(256);

// Build the exp and log tables using the generator element
function initTables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    // Multiply by the generator using carry-less multiplication
    x = gf256MultSlow(x, GENERATOR);
  }
  // EXP_TABLE[255] = 1 to handle wrap-around
  EXP_TABLE[255] = 1;
  // Extend the table for easier modular arithmetic: EXP_TABLE[i] = EXP_TABLE[i % 255]
  for (let i = 256; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255]!;
  }
}

/**
 * Slow multiplication used only for table construction.
 * Russian peasant multiplication with polynomial reduction.
 */
function gf256MultSlow(a: number, b: number): number {
  let result = 0;
  let aa = a;
  let bb = b;
  while (bb > 0) {
    if (bb & 1) {
      result ^= aa;
    }
    aa <<= 1;
    if (aa & 0x100) {
      aa ^= IRREDUCIBLE_POLY;
    }
    bb >>= 1;
  }
  return result;
}

// Initialize tables at module load time
initTables();

/**
 * Add two elements in GF(256). Addition in GF(2^8) is XOR.
 */
export function gf256Add(a: number, b: number): number {
  return a ^ b;
}

/**
 * Subtract two elements in GF(256). In GF(2^8), subtraction is the same as addition (XOR).
 */
export function gf256Sub(a: number, b: number): number {
  return a ^ b;
}

/**
 * Multiply two elements in GF(256) using precomputed log/exp tables.
 * O(1) operation.
 */
export function gf256Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const logSum = LOG_TABLE[a]! + LOG_TABLE[b]!;
  return EXP_TABLE[logSum]!;
}

/**
 * Compute the multiplicative inverse of an element in GF(256).
 * Returns a^(-1) such that a * a^(-1) = 1.
 * Throws if a === 0 (zero has no inverse).
 */
export function gf256Inv(a: number): number {
  if (a === 0) {
    throw new Error('Cannot compute inverse of zero in GF(256)');
  }
  // a^(-1) = a^(254) = g^(255 - log(a))
  return EXP_TABLE[255 - LOG_TABLE[a]!]!;
}

/**
 * Divide two elements in GF(256): a / b = a * b^(-1).
 */
export function gf256Div(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero in GF(256)');
  }
  if (a === 0) return 0;
  const logDiff = LOG_TABLE[a]! - LOG_TABLE[b]! + 255;
  return EXP_TABLE[logDiff]!;
}

/**
 * Evaluate a polynomial at point x in GF(256) using Horner's method.
 * coefficients[0] is the constant term (the secret),
 * coefficients[k] is the coefficient of x^k.
 */
export function gf256EvalPoly(coefficients: readonly number[], x: number): number {
  if (coefficients.length === 0) {
    throw new Error('Polynomial must have at least one coefficient');
  }

  // Horner's method: start from the highest degree coefficient
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gf256Add(gf256Mul(result, x), coefficients[i]!);
  }
  return result;
}

/**
 * Lagrange interpolation at x=0 to recover the secret (constant term)
 * from a set of (x_i, y_i) points in GF(256).
 *
 * This is the core reconstruction step for Shamir's Secret Sharing.
 * Only the value at x=0 is needed (the secret is the constant term).
 */
export function gf256LagrangeInterpolateAtZero(
  xs: readonly number[],
  ys: readonly number[],
): number {
  const k = xs.length;
  if (k === 0) {
    throw new Error('Need at least one point for interpolation');
  }
  if (k !== ys.length) {
    throw new Error('xs and ys must have the same length');
  }

  let secret = 0;

  for (let i = 0; i < k; i++) {
    // Compute the Lagrange basis polynomial L_i(0)
    let numerator = 1;
    let denominator = 1;

    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      // L_i(0) = product over j!=i of (0 - x_j) / (x_i - x_j)
      // In GF(256): subtraction is XOR, and 0 XOR x_j = x_j
      numerator = gf256Mul(numerator, xs[j]!);
      denominator = gf256Mul(denominator, gf256Sub(xs[i]!, xs[j]!));
    }

    // L_i(0) = numerator / denominator
    const lagrangeBasis = gf256Div(numerator, denominator);

    // secret += y_i * L_i(0) in GF(256)
    secret = gf256Add(secret, gf256Mul(ys[i]!, lagrangeBasis));
  }

  return secret;
}
