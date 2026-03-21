import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────

export const BloomLevelSchema = z.enum([
  'REMEMBER',
  'UNDERSTAND',
  'APPLY',
  'ANALYZE',
  'EVALUATE',
  'CREATE',
]);

export const QuestionTemplateStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'FIELD_TESTING',
  'CALIBRATED',
  'PRODUCTION',
  'RETIRED',
]);

// ── IRT Parameters ─────────────────────────────────────────────────────

export const IRTParametersSchema = z.object({
  a: z.number().positive().describe('Discrimination parameter'),
  b: z.number().describe('Difficulty parameter'),
  c: z.number().min(0).max(1).describe('Pseudo-guessing parameter'),
});

export const IRTParameterStatsSchema = z.object({
  aMean: z.number().positive(),
  aStd: z.number().nonnegative(),
  bMean: z.number(),
  bStd: z.number().nonnegative(),
  cMean: z.number().min(0).max(1),
  cStd: z.number().nonnegative(),
});

// ── Distractor Profile ─────────────────────────────────────────────────

export const DistractorProfileSchema = z.record(z.string(), z.number().min(0).max(1))
  .refine(
    (profile) => {
      const sum = Object.values(profile).reduce((acc, v) => acc + v, 0);
      return Math.abs(sum - 1.0) < 0.01;
    },
    { message: 'Distractor profile probabilities must sum to approximately 1.0' },
  );

// ── Template Parameter ─────────────────────────────────────────────────

export const TemplateParameterSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['integer', 'float', 'string']),
  min: z.number().optional(),
  max: z.number().optional(),
  allowedValues: z.array(z.union([z.string(), z.number()])).optional(),
}).refine(
  (param) => {
    if (param.type === 'string' && (param.min !== undefined || param.max !== undefined)) {
      return false;
    }
    return true;
  },
  { message: 'String parameters should not have min/max; use allowedValues instead' },
);

// ── Distractor Definition ──────────────────────────────────────────────

export const DistractorDefinitionSchema = z.object({
  label: z.string().min(1).max(8),
  formula: z.string().min(1),
  explanation: z.string().optional(),
});

// ── Parameter Instantiation ────────────────────────────────────────────

export const ParameterInstantiationSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  irt: IRTParametersSchema,
  distractorProfile: DistractorProfileSchema,
});

// ── Question Template ──────────────────────────────────────────────────

export const QuestionTemplateSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().min(1).max(128),
  topic: z.string().min(1).max(128),
  subtopic: z.string().min(1).max(128),
  bloomLevel: BloomLevelSchema,
  templateText: z.string().min(1).max(10000),
  parameters: z.array(TemplateParameterSchema),
  answerFormula: z.string().min(1).max(2000),
  distractors: z.array(DistractorDefinitionSchema).min(3).max(5),
  irtStats: IRTParameterStatsSchema,
  fieldTestCount: z.number().int().nonnegative(),
  calibrationDate: z.string().datetime(),
  status: QuestionTemplateStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Generate Template Request ──────────────────────────────────────────

export const GenerateTemplateRequestSchema = z.object({
  subject: z.string().min(1).max(128),
  topic: z.string().min(1).max(128),
  subtopic: z.string().min(1).max(128),
  bloomLevel: BloomLevelSchema,
  exampleTemplate: z.string().max(10000).optional(),
});

// ── Generate Template Response ─────────────────────────────────────────

export const GenerateTemplateResponseSchema = z.object({
  templateText: z.string().min(1),
  parameters: z.array(TemplateParameterSchema),
  answerFormula: z.string().min(1),
  distractors: z.array(DistractorDefinitionSchema).min(3).max(5),
});

// ── Inferred Types ─────────────────────────────────────────────────────

export type ZodQuestionTemplate = z.infer<typeof QuestionTemplateSchema>;
export type ZodParameterInstantiation = z.infer<typeof ParameterInstantiationSchema>;
export type ZodGenerateTemplateRequest = z.infer<typeof GenerateTemplateRequestSchema>;
export type ZodGenerateTemplateResponse = z.infer<typeof GenerateTemplateResponseSchema>;
