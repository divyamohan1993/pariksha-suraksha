/**
 * Assignment matrix types for the ParikshaSuraksha exam integrity system.
 * Matches the patent schema from the design spec addendum (Fix 5).
 *
 * The assignment matrix maps (centerId, seatNum) -> list of question assignments.
 * All lookups are O(1) via Map-based access.
 */

/**
 * A single question assignment within a candidate's paper.
 * Matches the Firestore schema: seats/{seatNum}/assignment.questionAssignments[].
 */
export interface QuestionAssignment {
  /** Position of this question within the paper (1-indexed). */
  readonly position: number;
  /** Reference to the question template. */
  readonly templateId: string;
  /** Reference to the specific parameter instantiation. */
  readonly paramInstantiationId: string;
  /** GCS URI of the AES-256-GCM encrypted question blob. */
  readonly encryptedBlobUri: string;
  /** Encrypted answer key (encrypted with the same DEK as the question). */
  readonly encryptedAnswerKey: string;
}

/**
 * The complete assignment for a single seat.
 * Stored at: exams/{examId}/centers/{centerId}/seats/{seatNum}/assignment.
 */
export interface AssignmentEntry {
  readonly centerId: string;
  readonly seatNum: number;
  readonly questionAssignments: ReadonlyArray<QuestionAssignment>;
  /** Sum of IRT difficulty (b) parameters across all assigned questions. */
  readonly difficultySum: number;
  /** Hash of the topic coverage vector for fast equality checks between papers. */
  readonly topicCoverageHash: string;
}

/**
 * The full assignment matrix for an exam.
 * Organized as a two-level Map for O(1) lookups: centerId -> seatNum -> AssignmentEntry.
 */
export interface AssignmentMatrix {
  readonly examId: string;
  /**
   * Map<centerId, Map<seatNum, AssignmentEntry>>.
   * O(1) lookup for any (center, seat) combination.
   */
  readonly entries: ReadonlyMap<string, ReadonlyMap<number, AssignmentEntry>>;
  readonly totalPapers: number;
  readonly generatedAt: string;
}

/**
 * Serializable version of AssignmentMatrix for Firestore/JSON storage.
 * Uses nested records instead of Maps for serialization compatibility.
 */
export interface SerializableAssignmentMatrix {
  readonly examId: string;
  /** Record<centerId, Record<seatNum, AssignmentEntry>> */
  readonly entries: Readonly<Record<string, Readonly<Record<number, AssignmentEntry>>>>;
  readonly totalPapers: number;
  readonly generatedAt: string;
}
