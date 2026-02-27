import { Router } from 'express';

import { healthRoutes } from '../modules/health/health.routes';
import { sessionsRoutes } from '../modules/sessions/sessions.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/sessions', sessionsRoutes);

export { router as apiRoutes };
