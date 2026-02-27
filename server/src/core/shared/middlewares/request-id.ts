import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingRequestId = req.header('x-request-id');
  req.requestId = incomingRequestId && incomingRequestId.trim() ? incomingRequestId : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};
