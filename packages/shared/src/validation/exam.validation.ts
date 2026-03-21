import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────

export const ExamStatusSchema = z.enum([
  'DRAFT',
  'BLUEPRINT_SET',
  'MATRIX_GENERATING',
  'MATRIX_READY',
  'ENCRYPTING',
  'ENCRYPTED',
  'DISTRIBUTING',
  'DISTRIBUTED',
  'KEY_RELEASE_SCHEDULED',
  'ACTIVE',
  'COLLECTING',
  'COLLUSION_CHECK',
  'EQUATING',
  'RESULTS_READY',
  'COMPLETED',
  'CANCELLED',
]);

// ── Difficulty Distribution ────────────────────────────────────────────

export const DifficultyDistributionSchema = z.object({
  easy: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  hard: z.number().int().nonnegative(),
}).refine(
  (d) => d.easy + d.medium + d.hard > 0,
  { message: 'Total question count must be greater than 0' },
);

// ── Topic Coverage ─────────────────────────────────────────────────────

export const TopicCoverageEntrySchema = z.object({
  topic: z.string().min(1).max(128),
  subtopic: z.string().min(1).max(128).optional(),
  questionCount: z.number().int().positive(),
  bloomLevels: z.array(z.string()).optional(),
});

// ── Exam Blueprint ─────────────────────────────────────────────────────

export const ExamBlueprintSchema = z.object({
  examId: z.string().uuid(),
  difficultyDistribution: DifficultyDistributionSchema,
  topicCoverage: z.array(TopicCoverageEntrySchema).min(1),
  questionsPerPaper: z.number().int().positive().max(500),
  maxNeighborOverlap: z.number().min(0).max(1).default(0.1),
  maxCrossCenterOverlap: z.number().min(0).max(1).default(0.15),
}).refine(
  (bp) => {
    const totalFromDifficulty =
      bp.difficultyDistribution.easy +
      bp.difficultyDistribution.medium +
      bp.difficultyDistribution.hard;
    return totalFromDifficulty === bp.questionsPerPaper;
  },
  { message: 'Difficulty distribution must sum to questionsPerPaper' },
).refine(
  (bp) => {
    const totalFromTopics = bp.topicCoverage.reduce((sum, t) => sum + t.questionCount, 0);
    return totalFromTopics === bp.questionsPerPaper;
  },
  { message: 'Topic coverage question counts must sum to questionsPerPaper' },
);

// ── Exam ───────────────────────────────────────────────────────────────

export const ExamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
  date: z.string().datetime(),
  subjects: z.array(z.string().min(1)).min(1),
  totalQuestions: z.number().int().positive(),
  totalCandidates: z.number().int().positive(),
  status: ExamStatusSchema,
  blueprint: ExamBlueprintSchema.optional(),
  durationMinutes: z.number().int().positive().max(480),
  scheduledStartTime: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Create Exam Request ────────────────────────────────────────────────

export const CreateExamRequestSchema = z.object({
  name: z.string().min(1).max(256),
  date: z.string().datetime(),
  subjects: z.array(z.string().min(1)).min(1),
  totalQuestions: z.number().int().positive(),
  durationMinutes: z.number().int().positive().max(480),
  scheduledStartTime: z.string().datetime(),
});

// ── Matrix Generation Progress ─────────────────────────────────────────

export const MatrixGenerationProgressSchema = z.object({
  examId: z.string().uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  percentComplete: z.number().min(0).max(100),
  centersProcessed: z.number().int().nonnegative(),
  totalCenters: z.number().int().nonnegative(),
  currentEnergy: z.number().optional(),
  constraintViolations: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});

// ── Inferred Types ─────────────────────────────────────────────────────

export type ZodExam = z.infer<typeof ExamSchema>;
export type ZodExamBlueprint = z.infer<typeof ExamBlueprintSchema>;
export type ZodCreateExamRequest = z.infer<typeof CreateExamRequestSchema>;
