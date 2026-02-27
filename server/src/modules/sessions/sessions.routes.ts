import { Router } from 'express';

import {
  createSession,
  getSession,
  postTurn,
  streamSession,
  submitTaskAssignment,
} from './sessions.controller';

const router = Router();

router.post('/', createSession);
router.get('/:id', getSession);
router.post('/:id/turn', postTurn);
router.post('/:id/task-assignment', submitTaskAssignment);
router.get('/:id/stream', streamSession);

export { router as sessionsRoutes };
