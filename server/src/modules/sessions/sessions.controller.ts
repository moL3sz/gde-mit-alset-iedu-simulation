import type { RequestHandler } from 'express';

import type { CreateSessionBody, PostTurnBody } from './sessions.schema';
import { createSessionSchema, postTurnSchema } from './sessions.schema';
import { sessionsService } from './sessions.service';

export const createSession: RequestHandler<never, unknown, CreateSessionBody> = async (
  req,
  res,
  next,
) => {
  try {
    const payload = createSessionSchema.parse(req.body);
    const response = await sessionsService.createSession(payload);
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
