import type { RequestHandler } from 'express';

export const healthCheck: RequestHandler = (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};
