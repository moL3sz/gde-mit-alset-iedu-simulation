import { z } from 'zod';

import { StudentProfile } from '../../database/entities/Student';

export const studentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const getStudentsQuerySchema = z.object({
  classroomId: z.coerce.number().int().positive().optional(),
});

export const createStudentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  attentiveness: z.coerce.number().int().min(0).max(10).optional(),
  behavior: z.coerce.number().int().min(0).max(10).optional(),
  comprehension: z.coerce.number().int().min(0).max(10).optional(),
  profile: z.nativeEnum(StudentProfile).optional(),
  classroomId: z.coerce.number().int().positive().nullable().optional(),
});

export const updateStudentSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    attentiveness: z.coerce.number().int().min(0).max(10).optional(),
    behavior: z.coerce.number().int().min(0).max(10).optional(),
    comprehension: z.coerce.number().int().min(0).max(10).optional(),
    profile: z.nativeEnum(StudentProfile).optional(),
    classroomId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.attentiveness !== undefined ||
      value.behavior !== undefined ||
      value.comprehension !== undefined ||
      value.profile !== undefined ||
      value.classroomId !== undefined,
    {
      message: 'At least one field is required.',
    },
  );

export type CreateStudentBody = z.infer<typeof createStudentSchema>;
export type UpdateStudentBody = z.infer<typeof updateStudentSchema>;
