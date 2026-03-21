/**
 * Cryptographic types for the ParikshaSuraksha exam integrity system.
 * Covers time-lock puzzles, Shamir's secret sharing, encrypted blobs,
 * and key scheduling.
 */

/**
 * RSA time-lock puzzle parameters.
 * Solving requires t sequential modular squarings without knowledge of phi(n).
 * See spec section 5.4 for construction details.
 */
export interface TimeLockPuzzle {
  /** RSA modulus n = p * q (4096-bit). p and q are destroyed after creation. */
  readonly n: string;
  /** Random base for sequential squaring. */
  readonly a: string;
  /** Number of sequential squarings required. */
  readonly t: string;
  /** Encrypted key: (key_int + a^(2^t) mod n) mod n. */
  readonly cipher: string;
  readonly targetReleaseTime: string;
  readonly createdAt: string;
}

/**
 * A single Shamir secret sharing fragment.
 * Per addendum Fix 13: fragments are per-exam KEK, not global.
 */
export interface ShamirFragment {
  readonly fragmentId: string;
  readonly examId: string;
  /** Share index (1-based). */
  readonly shareIndex: number;
  /** The share value (hex-encoded). */
  readonly shareValue: string;
  /** Identity of the fragment holder. */
  readonly holderId: string;
  readonly holderRole: string;
  /** Whether this fragment has been submitted for reconstruction. */
  readonly submitted: boolean;
}

/**
 * An AES-256-GCM encrypted blob stored in GCS.
 */
export interface EncryptedBlob {
  /** GCS URI: gs://pariksha-encrypted-questions/{examId}/{questionId}.enc */
  readonly uri: string;
  /** The data encryption key, itself encrypted by Cloud KMS. */
  readonly encryptedDek: string;
  /** GCM initialization vector (96-bit, base64). */
  readonly iv: string;
  /** GCM authentication tag (128-bit, base64). */
  readonly authTag: string;
  /** SHA-256 hash of the plaintext for integrity verification. */
  readonly plaintextHash: string;
  readonly encryptedAt: string;
}

/**
 * Key schedule for an exam: tracks the lifecycle of all encryption keys.
 */
export interface KeySchedule {
  readonly examId: string;
  /** Per-exam Key Encrypting Key (KEK) status. */
  readonly kekStatus: 'generated' | 'distributed' | 'released' | 'destroyed';
  readonly shamirThreshold: number;
  readonly shamirTotalShares: number;
  readonly fragmentsSubmitted: number;
  /** Cloud KMS crypto key version used for the KEK. */
  readonly kmsKeyVersion: string;
  readonly tlpGenerated: boolean;
  readonly scheduledReleaseTime: string;
  readonly actualReleaseTime?: string;
  readonly emergencyRelease: boolean;
  readonly retentionExpiresAt: string;
}

/**
 * TLP calibration data stored per exam.
 * See addendum Fix 9.
 */
export interface TlpCalibration {
  readonly examId: string;
  readonly squaringsPerSec: number;
  readonly measuredOn: string;
  readonly safetyMarginSec: number;
  readonly machineType: string;
}
