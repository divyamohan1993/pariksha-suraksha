/**
 * Exam-related types for the ParikshaSuraksha exam integrity system.
 * Covers exam lifecycle, blueprints, and difficulty distribution.
 */

export enum ExamStatus {
  DRAFT = 'DRAFT',
  BLUEPRINT_SET = 'BLUEPRINT_SET',
  MATRIX_GENERATING = 'MATRIX_GENERATING',
  MATRIX_READY = 'MATRIX_READY',
  ENCRYPTING = 'ENCRYPTING',
  ENCRYPTED = 'ENCRYPTED',
  DISTRIBUTING = 'DISTRIBUTING',
  DISTRIBUTED = 'DISTRIBUTED',
  KEY_RELEASE_SCHEDULED = 'KEY_RELEASE_SCHEDULED',
  ACTIVE = 'ACTIVE',
  COLLECTING = 'COLLECTING',
  COLLUSION_CHECK = 'COLLUSION_CHECK',
  EQUATING = 'EQUATING',
  RESULTS_READY = 'RESULTS_READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Difficulty distribution spec within an exam blueprint.
 * Maps difficulty bands to target question counts.
 */
export interface DifficultyDistribution {
  /** Number of easy questions (IRT b < -1.0) */
  readonly easy: number;
  /** Number of medium questions (-1.0 <= IRT b <= 1.0) */
  readonly medium: number;
  /** Number of hard questions (IRT b > 1.0) */
  readonly hard: number;
}

/**
 * Topic coverage requirement in the blueprint.
 */
export interface TopicCoverageEntry {
  readonly topic: string;
  readonly subtopic?: string;
  readonly questionCount: number;
  readonly bloomLevels?: ReadonlyArray<string>;
}

/**
 * The exam blueprint defines the composition constraints for paper generation.
 * The matrix solver uses this as input.
 */
export interface ExamBlueprint {
  readonly examId: string;
  readonly difficultyDistribution: DifficultyDistribution;
  readonly topicCoverage: ReadonlyArray<TopicCoverageEntry>;
  readonly questionsPerPaper: number;
  /** Maximum fraction of shared questions between adjacent seats. Must be < 0.10. */
  readonly maxNeighborOverlap: number;
  /** Maximum fraction of shared questions across different centers. Must be < 0.15. */
  readonly maxCrossCenterOverlap: number;
}

/**
 * Top-level exam entity stored in Firestore at exams/{examId}.
 */
export interface Exam {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly subjects: ReadonlyArray<string>;
  readonly totalQuestions: number;
  readonly totalCandidates: number;
  readonly status: ExamStatus;
  readonly blueprint?: ExamBlueprint;
  readonly durationMinutes: number;
  readonly scheduledStartTime: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Matrix generation progress reported via WebSocket to the admin dashboard.
 */
export interface MatrixGenerationProgress {
  readonly examId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly percentComplete: number;
  readonly centersProcessed: number;
  readonly totalCenters: number;
  readonly currentEnergy?: number;
  readonly constraintViolations?: number;
  readonly errorMessage?: string;
}
