/**
 * Question-related types for the ParikshaSuraksha exam integrity system.
 * Covers question templates, parameter instantiations, IRT calibration,
 * and distractor profiles.
 */

export enum BloomLevel {
  REMEMBER = 'REMEMBER',
  UNDERSTAND = 'UNDERSTAND',
  APPLY = 'APPLY',
  ANALYZE = 'ANALYZE',
  EVALUATE = 'EVALUATE',
  CREATE = 'CREATE',
}

/**
 * IRT 3PL model parameters for a single question instantiation.
 * a = discrimination, b = difficulty, c = guessing pseudo-chance.
 */
export interface IRTParameters {
  /** Discrimination parameter (slope). Higher = better at distinguishing ability levels. */
  readonly a: number;
  /** Difficulty parameter (location on ability scale). */
  readonly b: number;
  /** Pseudo-guessing parameter. Lower bound of the item characteristic curve. */
  readonly c: number;
}

/**
 * Aggregate IRT statistics across all instantiations of a template.
 * Used to verify isomorphic equivalence across parameter instantiations.
 */
export interface IRTParameterStats {
  readonly aMean: number;
  readonly aStd: number;
  readonly bMean: number;
  readonly bStd: number;
  readonly cMean: number;
  readonly cStd: number;
}

/**
 * Probability distribution over answer choices for a single instantiation.
 * Keys are choice labels (e.g. 'A', 'B', 'C', 'D'), values are selection probabilities.
 * Used as O(1) lookup in collusion detection.
 */
export interface DistractorProfile {
  readonly [choiceLabel: string]: number;
}

/**
 * A named parameter within a question template, with its allowed value range.
 */
export interface TemplateParameter {
  readonly name: string;
  readonly type: 'integer' | 'float' | 'string';
  readonly min?: number;
  readonly max?: number;
  readonly allowedValues?: ReadonlyArray<string | number>;
}

/**
 * A concrete binding of parameter names to values for one instantiation.
 */
export interface ParameterInstantiation {
  readonly id: string;
  readonly templateId: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly irt: IRTParameters;
  readonly distractorProfile: DistractorProfile;
}

/**
 * Distractor definition within a question template.
 */
export interface DistractorDefinition {
  readonly label: string;
  readonly formula: string;
  readonly explanation?: string;
}

/**
 * A parameterized question template. The template text contains placeholders
 * (e.g. {{mass}}, {{velocity}}) that are filled by ParameterInstantiation values.
 */
export interface QuestionTemplate {
  readonly id: string;
  readonly subject: string;
  readonly topic: string;
  readonly subtopic: string;
  readonly bloomLevel: BloomLevel;
  readonly templateText: string;
  readonly parameters: ReadonlyArray<TemplateParameter>;
  readonly answerFormula: string;
  readonly distractors: ReadonlyArray<DistractorDefinition>;
  readonly irtStats: IRTParameterStats;
  readonly fieldTestCount: number;
  readonly calibrationDate: string;
  readonly status: QuestionTemplateStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export enum QuestionTemplateStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  FIELD_TESTING = 'FIELD_TESTING',
  CALIBRATED = 'CALIBRATED',
  PRODUCTION = 'PRODUCTION',
  RETIRED = 'RETIRED',
}

/**
 * Request payload for Gemini-based template generation.
 */
export interface GenerateTemplateRequest {
  readonly subject: string;
  readonly topic: string;
  readonly subtopic: string;
  readonly bloomLevel: BloomLevel;
  readonly exampleTemplate?: string;
}

/**
 * Response from Gemini template generation (before human review).
 */
export interface GenerateTemplateResponse {
  readonly templateText: string;
  readonly parameters: ReadonlyArray<TemplateParameter>;
  readonly answerFormula: string;
  readonly distractors: ReadonlyArray<DistractorDefinition>;
}
