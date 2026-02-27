import { z } from 'zod';

export const classroomIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createClassroomSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateClassroomSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: 'At least one field is required.',
  });

export type CreateClassroomBody = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomBody = z.infer<typeof updateClassroomSchema>;
