import { z } from 'zod';

// ── Question Assignment ────────────────────────────────────────────────

export const QuestionAssignmentSchema = z.object({
  position: z.number().int().positive(),
  templateId: z.string().uuid(),
  paramInstantiationId: z.string().uuid(),
  encryptedBlobUri: z.string().url().startsWith('gs://'),
  encryptedAnswerKey: z.string().min(1),
});

// ── Assignment Entry ───────────────────────────────────────────────────

export const AssignmentEntrySchema = z.object({
  centerId: z.string().min(1),
  seatNum: z.number().int().positive(),
  questionAssignments: z.array(QuestionAssignmentSchema).min(1),
  difficultySum: z.number(),
  topicCoverageHash: z.string().min(1),
}).refine(
  (entry) => {
    // Verify positions are sequential starting from 1, no gaps
    const positions = entry.questionAssignments.map((qa) => qa.position).sort((a, b) => a - b);
    return positions.every((pos, idx) => pos === idx + 1);
  },
  { message: 'Question positions must be sequential starting from 1 with no gaps' },
);

// ── Serializable Assignment Matrix ─────────────────────────────────────

export const SerializableAssignmentMatrixSchema = z.object({
  examId: z.string().uuid(),
  entries: z.record(
    z.string(),
    z.record(
      z.string(),
      AssignmentEntrySchema,
    ),
  ),
  totalPapers: z.number().int().positive(),
  generatedAt: z.string().datetime(),
});

// ── Inferred Types ─────────────────────────────────────────────────────

export type ZodQuestionAssignment = z.infer<typeof QuestionAssignmentSchema>;
export type ZodAssignmentEntry = z.infer<typeof AssignmentEntrySchema>;
export type ZodSerializableAssignmentMatrix = z.infer<typeof SerializableAssignmentMatrixSchema>;
