/**
 * Core interfaces for the Paper Generator service.
 * Aligned with Firestore schema (addendum Fix 5) and Redis cache schema (addendum Fix 7).
 */

/** Single question assignment within a paper — maps to Firestore seats/{seatNum}/assignment */
export interface QuestionAssignment {
  /** 1-based position in the paper */
  position: number;
  /** Reference to the question template */
  templateId: string;
  /** Specific parameter instantiation used */
  paramInstantiationId: string;
  /** GCS URI of AES-256-GCM encrypted question blob */
  encryptedBlobUri: string;
  /** Encrypted answer key for grading */
  encryptedAnswerKey: string;
}

/** Full seat assignment stored in Firestore */
export interface SeatAssignment {
  questionAssignments: QuestionAssignment[];
  difficultySum: number;
  topicCoverageHash: string;
}

/** A single rendered question ready for display in the exam terminal */
export interface RenderedQuestion {
  /** 1-based position in the paper */
  position: number;
  /** Unique question identifier (templateId:paramInstantiationId) */
  questionId: string;
  /** Rendered question text (HTML with KaTeX-rendered math) */
  renderedText: string;
  /** Answer options with rendered text */
  options: RenderedOption[];
  /** Marks awarded for correct answer */
  marks: number;
  /** Marks deducted for incorrect answer (0 if no negative marking) */
  negativeMarks: number;
  /** Subject/topic metadata */
  section: string;
  /** Bloom's taxonomy level */
  bloomLevel: string;
}

/** A single answer option */
export interface RenderedOption {
  /** Option label: A, B, C, D */
  label: string;
  /** Rendered option text (HTML with KaTeX-rendered math) */
  renderedText: string;
}

/** Complete pre-rendered paper JSON — cached in Redis as a single value */
export interface PreRenderedPaper {
  /** Exam identifier */
  examId: string;
  /** Center identifier */
  centerId: string;
  /** Seat number */
  seatNum: string;
  /** ISO-8601 timestamp when paper was rendered */
  renderedAt: string;
  /** Paper version hash for integrity verification */
  paperHash: string;
  /** Navigation metadata */
  metadata: PaperMetadata;
  /** All rendered questions in order */
  questions: RenderedQuestion[];
}

/** Paper-level metadata for the exam terminal UI */
export interface PaperMetadata {
  /** Total number of questions */
  totalQuestions: number;
  /** Total marks available */
  totalMarks: number;
  /** Exam duration in minutes */
  durationMinutes: number;
  /** Section breakdown */
  sections: SectionMetadata[];
  /** Time allocation guidance per section (optional) */
  timeAllocation: Record<string, number>;
}

/** Section metadata within a paper */
export interface SectionMetadata {
  /** Section name (e.g., "Physics", "Chemistry") */
  name: string;
  /** Number of questions in this section */
  questionCount: number;
  /** Starting position (1-based) */
  startPosition: number;
  /** Ending position (1-based) */
  endPosition: number;
  /** Total marks for this section */
  totalMarks: number;
}

/** Decrypted question content from crypto-lifecycle service */
export interface DecryptedQuestion {
  /** Position in the paper (assigned by matrix solver, may be overridden) */
  position: number;
  templateId: string;
  paramInstantiationId: string;
  /** Template text with parameter placeholders e.g. "Find the value of {{a}} + {{b}}" */
  templateText: string;
  /** Resolved parameter values */
  params: Record<string, string | number>;
  /** Answer formula or resolved answer */
  answerFormula: string;
  /** Option texts (may contain LaTeX) */
  options: { label: string; text: string }[];
  /** Marks for this question */
  marks: number;
  /** Negative marks for incorrect answer */
  negativeMarks: number;
  /** Section/subject this question belongs to */
  section: string;
  /** Bloom's taxonomy level */
  bloomLevel: string;
}

/** Matrix generation job status */
export interface MatrixStatus {
  examId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalPapers: number;
  completedPapers: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/** Exam blueprint sent to matrix solver */
export interface ExamBlueprint {
  examId: string;
  name: string;
  totalQuestions: number;
  questionsPerPaper: number;
  subjects: string[];
  difficultyDistribution: Record<string, number>;
  topicCoverage: Record<string, number>;
  centers: CenterLayout[];
}

/** Center layout for matrix generation */
export interface CenterLayout {
  centerId: string;
  name: string;
  totalSeats: number;
  seatNumbers: string[];
}

/** Question bank metadata sent alongside blueprint */
export interface QuestionBankMetadata {
  totalTemplates: number;
  totalInstantiations: number;
  subjectBreakdown: Record<string, number>;
  calibrationStatus: 'all_calibrated' | 'partially_calibrated';
}
