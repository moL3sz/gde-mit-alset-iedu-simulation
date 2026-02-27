import { Router } from 'express';

import {
  createSession,
  getSession,
  postSupervisorHint,
  postTaskAssignment,
  postTurn,
  streamSession,
} from './sessions.controller';

const router = Router();

router.post('/', createSession);
router.get('/:id', getSession);
router.post('/:id/turn', postTurn);
router.post('/:id/supervisor-hint', postSupervisorHint);
router.post('/:id/task-assignment', postTaskAssignment);
router.get('/:id/stream', streamSession);

export { router as sessionsRoutes };
