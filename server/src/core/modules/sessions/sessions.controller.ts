import type { RequestHandler } from 'express';

import type {
  CreateSessionBody,
  PostTurnBody,
  SupervisorHintBody,
  TaskAssignmentBody,
} from './sessions.schema';
import {
  createSessionSchema,
  postTurnSchema,
  supervisorHintSchema,
  taskAssignmentSchema,
} from './sessions.schema';
import { sessionsService } from './sessions.service';

export const createSession: RequestHandler<never, unknown, CreateSessionBody> = (
  req,
  res,
  next,
) => {
  try {
    const payload = createSessionSchema.parse(req.body);
    const response = sessionsService.createSession(payload);
    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getSession: RequestHandler<{ id: string }> = (req, res, next) => {
  try {
    const response = sessionsService.getSession(req.params.id);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const postTurn: RequestHandler<{ id: string }, unknown, PostTurnBody> = async (
  req,
  res,
  next,
) => {
  try {
    const payload = postTurnSchema.parse(req.body);
    const response = await sessionsService.postTurn(req.params.id, payload);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const streamSession: RequestHandler<{ id: string }> = (req, res) => {
  res.status(501).json({
    message: `SSE stream endpoint is a placeholder for session ${req.params.id}.`,
  });
};

export const postSupervisorHint: RequestHandler<{ id: string }, unknown, SupervisorHintBody> = (
  req,
  res,
  next,
) => {
  try {
    const payload = supervisorHintSchema.parse(req.body);
    const response = sessionsService.submitSupervisorHint(req.params.id, payload.hintText);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const postTaskAssignment: RequestHandler<{ id: string }, unknown, TaskAssignmentBody> = (
  req,
  res,
  next,
) => {
  try {
    const payload = taskAssignmentSchema.parse(req.body);
    const response = sessionsService.submitTaskAssignment(req.params.id, payload);
    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};
