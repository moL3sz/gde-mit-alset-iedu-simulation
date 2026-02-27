import type { RequestHandler } from 'express';

import type { CreateClassroomBody, UpdateClassroomBody } from './classroom.schema';
import { classroomIdParamSchema, createClassroomSchema, updateClassroomSchema } from './classroom.schema';
import { classroomService } from './classroom.service';

export const getClassrooms: RequestHandler = async (_req, res, next) => {
  try {
    const response = await classroomService.getAll();
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getClassroomById: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { id } = classroomIdParamSchema.parse(req.params);
    const response = await classroomService.getById(id);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const createClassroom: RequestHandler<never, unknown, CreateClassroomBody> = async (
  req,
  res,
  next,
) => {
  try {
    const payload = createClassroomSchema.parse(req.body);
    const response = await classroomService.create(payload);
    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const updateClassroom: RequestHandler<{ id: string }, unknown, UpdateClassroomBody> = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = classroomIdParamSchema.parse(req.params);
    const payload = updateClassroomSchema.parse(req.body);
    const response = await classroomService.update(id, payload);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteClassroom: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { id } = classroomIdParamSchema.parse(req.params);
    await classroomService.delete(id);
    res.status(204).send();
  } catch (error: unknown) {
    next(error);
  }
};

export const getClassroomStudents: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { id } = classroomIdParamSchema.parse(req.params);
    const response = await classroomService.getStudentsByClassroomId(id);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};
