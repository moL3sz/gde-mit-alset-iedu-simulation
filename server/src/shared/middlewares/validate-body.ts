import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

import { AppError } from '../errors/app-error';

export const validateBody = (schema: ZodTypeAny): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        new AppError(400, 'Validation failed.', {
          issues: result.error.issues,
        }),
      );
      return;
    }

    req.body = result.data;
    next();
  };
};
