/**
 * Blockchain / audit trail types for the ParikshaSuraksha exam integrity system.
 * All mutation events are recorded on Hyperledger Fabric for tamper-evident auditing.
 */

/**
 * Exhaustive set of audit event types recorded on the blockchain.
 * Updated per addendum Fix 4 to include key_generate, scribe_action, emergency_release.
 */
export enum AuditEventType {
  QUESTION_CREATE = 'question_create',
  ENCRYPT = 'encrypt',
  KEY_GENERATE = 'key_generate',
  DISTRIBUTE = 'distribute',
  KEY_RELEASE = 'key_release',
  DECRYPT = 'decrypt',
  SUBMIT = 'submit',
  GRADE = 'grade',
  SCRIBE_ACTION = 'scribe_action',
  EMERGENCY_RELEASE = 'emergency_release',
}

/**
 * A single audit event stored on the Hyperledger Fabric ledger.
 */
export interface AuditEvent {
  readonly eventId: string;
  readonly eventType: AuditEventType;
  readonly examId: string;
  /** SHA-256 hash of the affected entity (question, response, key, etc.). */
  readonly entityHash: string;
  readonly timestamp: string;
  readonly actorId: string;
  readonly actorOrg: string;
  readonly actorType?: 'user' | 'scribe' | 'system';
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly txId?: string;
}

/**
 * Merkle proof for independent verification of an audit event.
 * Extracted from the Fabric block structure (see addendum Fix 11).
 */
export interface MerkleProof {
  readonly eventId: string;
  readonly txId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  /** Array of sibling hashes forming the Merkle path from leaf to root. */
  readonly merkleProof: ReadonlyArray<string>;
  readonly verified: boolean;
}

/**
 * Block metadata from Hyperledger Fabric.
 */
export interface BlockInfo {
  readonly blockNumber: number;
  readonly dataHash: string;
  readonly previousHash: string;
  readonly transactionCount: number;
  readonly timestamp: string;
}

/**
 * Verification result returned by the public verify endpoint.
 * Intentionally contains no PII.
 */
export interface VerificationResult {
  readonly verified: boolean;
  readonly timestamp: string;
}
