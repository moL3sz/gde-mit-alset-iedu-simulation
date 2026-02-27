import type { RequestHandler } from 'express';

import type { CreateStudentBody, UpdateStudentBody } from './student.schema';
import {
  createStudentSchema,
  getStudentsQuerySchema,
  studentIdParamSchema,
  updateStudentSchema,
} from './student.schema';
import { studentService } from './student.service';

export const getStudents: RequestHandler<never, unknown, never, { classroomId?: string }> = async (
  req,
  res,
  next,
) => {
  try {
    const { classroomId } = getStudentsQuerySchema.parse(req.query);
    const response = await studentService.getAll(classroomId);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getStudentById: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { id } = studentIdParamSchema.parse(req.params);
    const response = await studentService.getById(id);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const createStudent: RequestHandler<never, unknown, CreateStudentBody> = async (
  req,
  res,
  next,
) => {
  try {
    const payload = createStudentSchema.parse(req.body);
    const response = await studentService.create(payload);
    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const updateStudent: RequestHandler<{ id: string }, unknown, UpdateStudentBody> = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = studentIdParamSchema.parse(req.params);
    const payload = updateStudentSchema.parse(req.body);
    const response = await studentService.update(id, payload);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteStudent: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { id } = studentIdParamSchema.parse(req.params);
    await studentService.delete(id);
    res.status(204).send();
  } catch (error: unknown) {
    next(error);
  }
};
