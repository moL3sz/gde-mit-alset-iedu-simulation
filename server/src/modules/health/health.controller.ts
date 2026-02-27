import type { RequestHandler } from 'express';

import type { HealthResponse } from '../../core/@types';

export const getHealth: RequestHandler = (_req, res) => {
  const response: HealthResponse = {
    ok: true,
    uptime: process.uptime(),
  };

  res.status(200).json(response);
};
