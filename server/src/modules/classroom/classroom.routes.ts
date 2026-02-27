import { Router } from 'express';

import {
  createClassroom,
  deleteClassroom,
  getClassroomById,
  getClassroomStudents,
  getClassrooms,
  updateClassroom,
} from './classroom.controller';

const router = Router();

router.get('/', getClassrooms);
router.get('/:id', getClassroomById);
router.get('/:id/students', getClassroomStudents);
router.post('/', createClassroom);
router.put('/:id', updateClassroom);
router.delete('/:id', deleteClassroom);

export { router as classroomRoutes };
