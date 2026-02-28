import { z } from 'zod';

export const createSessionSchema = z.object({
  mode: z.enum(['classroom', 'debate']),
  channel: z.enum(['supervised', 'unsupervised']).optional(),
  topic: z.string().trim().min(2).max(300),
  period: z.coerce.number().int().positive().optional(),
  classroomId: z.coerce.number().int().positive().optional(),
  config: z
    .object({
      classroom: z
        .object({
          minResponders: z.coerce.number().int().min(1).max(4).optional(),
          maxResponders: z.coerce.number().int().min(1).max(4).optional(),
          relationshipOverrides: z
            .array(
              z.object({
                fromStudentId: z.string().trim().min(1),
                toStudentId: z.string().trim().min(1),
                relationship: z.enum(['good', 'neutral', 'bad']),
              }),
            )
            .optional(),
        })
        .optional(),
      debate: z
        .object({
          rubricWeights: z
            .object({
              argumentStrength: z.coerce.number().min(0).max(1).optional(),
              evidenceUse: z.coerce.number().min(0).max(1).optional(),
              clarity: z.coerce.number().min(0).max(1).optional(),
              rebuttal: z.coerce.number().min(0).max(1).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const postTurnSchema = z.object({
  teacherOrUserMessage: z.string().trim().min(1).max(2000),
});

export const submitTaskAssignmentSchema = z.object({
  mode: z.enum(['individual', 'pair', 'group']),
  groups: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        studentIds: z.array(z.string().trim().min(1)).min(1),
      }),
    )
    .optional(),
  autonomousGrouping: z.coerce.boolean().optional(),
});

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
export type PostTurnBody = z.infer<typeof postTurnSchema>;
export type SubmitTaskAssignmentBody = z.infer<typeof submitTaskAssignmentSchema>;
