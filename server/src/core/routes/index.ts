import { Router } from 'express';

import { classroomRoutes } from '../../modules/classroom/classroom.routes';
import { healthRoutes } from '../../modules/health/health.routes';
import { sessionsRoutes } from '../../modules/sessions/sessions.routes';
import { studentRoutes } from '../../modules/student/student.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/students', studentRoutes);
router.use('/classrooms', classroomRoutes);

export { router as apiRoutes };
