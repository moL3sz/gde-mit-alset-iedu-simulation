import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error';
import { logger } from '../logger';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;

  if (error instanceof ZodError) {
    res.status(400).json({
      requestId: req.requestId,
      error: {
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      requestId: req.requestId,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    });
    return;
  }

  logger.error('unhandled_error', {
    requestId: req.requestId,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  res.status(500).json({
    requestId: req.requestId,
    error: {
      message: 'Internal server error.',
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
};
