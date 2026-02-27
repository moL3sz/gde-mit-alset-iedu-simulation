import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    requestId: req.requestId,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found.`,
      code: 'ROUTE_NOT_FOUND',
    },
  });
};
