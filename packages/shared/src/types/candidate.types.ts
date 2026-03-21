/**
 * Candidate-related types for the ParikshaSuraksha exam integrity system.
 * Covers candidate profiles, responses, results, and accommodations.
 */

/**
 * Accommodation types per RPwD Act 2016 compliance.
 */
export interface Accommodation {
  readonly scribeAllowed: boolean;
  readonly extraTimeMinutes: number;
  readonly largeFontRequired: boolean;
  readonly screenReaderRequired: boolean;
  readonly switchAccessRequired: boolean;
  readonly eyeTrackingRequired: boolean;
  readonly customAccommodations?: ReadonlyArray<string>;
}

/**
 * Candidate profile stored at: candidates/{candidateId}/profile.
 */
export interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly examId: string;
  readonly centerId: string;
  readonly seatNum: number;
  readonly accommodations: Accommodation;
  readonly scribeId?: string;
  readonly createdAt: string;
}

/**
 * A single response to one question during the exam.
 */
export interface QuestionResponse {
  readonly questionPosition: number;
  readonly templateId: string;
  readonly paramInstantiationId: string;
  readonly selectedChoice: string | null;
  readonly markedForReview: boolean;
  readonly visited: boolean;
  readonly timeSpentMs: number;
}

/**
 * Encrypted candidate response blob reference.
 * Stored at: candidates/{candidateId}/responses.
 */
export interface CandidateResponse {
  readonly candidateId: string;
  readonly examId: string;
  readonly encryptedBlobUri: string;
  readonly submittedAt: string;
  readonly checkpointCount: number;
  readonly submissionHash: string;
}

/**
 * Candidate result after score equating.
 * Stored at: candidates/{candidateId}/result.
 */
export interface CandidateResult {
  readonly candidateId: string;
  readonly examId: string;
  readonly rawScore: number;
  readonly equatedScore: number;
  readonly equatingApplied: boolean;
  readonly thetaEstimate: number;
  readonly verificationHash: string;
  readonly gradedAt: string;
}

/**
 * Exam session checkpoint for resilience against disconnection.
 * Stored in Redis at: exam:{examId}:candidate:{candidateId}:checkpoint.
 */
export interface ExamCheckpoint {
  readonly candidateId: string;
  readonly examId: string;
  readonly responses: ReadonlyArray<QuestionResponse>;
  readonly currentQuestionPosition: number;
  readonly elapsedMs: number;
  readonly savedAt: string;
}
