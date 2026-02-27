import { Router } from 'express';

import { healthRoutes } from '../modules/health/health.routes';

const router = Router();

router.use('/health', healthRoutes);

export { router as apiRoutes };
