import { Router } from 'express';

import { createSession, getSession, postTurn, streamSession } from './sessions.controller';

const router = Router();

router.post('/', createSession);
router.get('/:id', getSession);
router.post('/:id/turn', postTurn);
router.get('/:id/stream', streamSession);

export { router as sessionsRoutes };
