/**
 * Collusion detection types for the ParikshaSuraksha exam integrity system.
 * Implements the log-likelihood ratio based pairwise collusion detection
 * with cluster analysis.
 */

/**
 * Evidence detail for a single shared question in a flagged pair.
 */
export interface CollusionQuestionEvidence {
  readonly questionPosition: number;
  readonly templateId: string;
  readonly responseU: string;
  readonly responseV: string;
  readonly correctAnswer: string;
  readonly matchType: 'same_wrong' | 'different_wrong' | 'skipped';
  /** Per-question contribution to the log-likelihood ratio. */
  readonly logLambdaContribution: number;
}

/**
 * Evidence bundle for a flagged candidate pair.
 */
export interface CollusionEvidence {
  readonly sharedQuestionCount: number;
  readonly sameWrongCount: number;
  readonly differentWrongCount: number;
  readonly questionDetails: ReadonlyArray<CollusionQuestionEvidence>;
  readonly seatingProximity: 'adjacent' | 'same_row' | 'same_room' | 'different_room';
}

/**
 * A single candidate pair evaluated for collusion.
 * Stored at: collusionResults/{examId}/{centerId}/pairs/{pairId}.
 */
export interface CollusionPair {
  readonly pairId: string;
  readonly candidateU: string;
  readonly candidateV: string;
  readonly centerId: string;
  /** Log-likelihood ratio. Higher values indicate stronger collusion evidence. */
  readonly logLambda: number;
  /** Decision threshold calibrated for the target FPR. */
  readonly threshold: number;
  readonly flagged: boolean;
  readonly evidence: CollusionEvidence;
}

/**
 * A cluster of candidates connected by pairwise collusion flags.
 * Identified via connected components on the flagged-pairs graph.
 */
export interface CollusionCluster {
  readonly clusterId: string;
  readonly centerId: string;
  readonly candidateIds: ReadonlyArray<string>;
  readonly pairIds: ReadonlyArray<string>;
  readonly maxLogLambda: number;
  readonly averageLogLambda: number;
}

/**
 * Complete collusion result for a center within an exam.
 */
export interface CollusionResult {
  readonly examId: string;
  readonly centerId: string;
  readonly totalPairsAnalyzed: number;
  readonly flaggedPairCount: number;
  readonly pairs: ReadonlyArray<CollusionPair>;
  readonly clusters: ReadonlyArray<CollusionCluster>;
  readonly evidenceReportUri?: string;
  readonly completedAt: string;
}
