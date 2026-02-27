import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      details: error.details ?? null,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: 'Validation failed.',
      details: error.flatten(),
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    message: 'Internal server error.',
  });
};
