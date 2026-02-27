import type { RequestHandler } from 'express';

export const authPlaceholderMiddleware: RequestHandler = (_req, _res, next) => {
  // Placeholder for future authentication/authorization.
  next();
};
