import { AppDataSource } from '../../database/data-source';
import { ClassRoom } from '../../database/entities/ClassRoom';
import { Student } from '../../database/entities/Student';
import { AppError } from '../../core/shared/errors/app-error';
import type { CreateClassroomBody, UpdateClassroomBody } from './classroom.schema';

export class ClassroomService {
  public async getAll(): Promise<ClassRoom[]> {
    return AppDataSource.getRepository(ClassRoom).find({
      order: { id: 'ASC' },
    });
  }

  public async getById(id: number): Promise<ClassRoom> {
    const classroom = await AppDataSource.getRepository(ClassRoom).findOne({
      where: { id },
      relations: { students: true },
    });

    if (!classroom) {
      throw new AppError(404, `Classroom with id ${id} was not found.`, 'CLASSROOM_NOT_FOUND');
    }

    return classroom;
  }

  public async create(payload: CreateClassroomBody): Promise<ClassRoom> {
    const repository = AppDataSource.getRepository(ClassRoom);
    const classroom = repository.create({
      name: payload.name,
    });

    return repository.save(classroom);
  }

  public async update(id: number, payload: UpdateClassroomBody): Promise<ClassRoom> {
    const repository = AppDataSource.getRepository(ClassRoom);
    const classroom = await repository.findOneBy({ id });

    if (!classroom) {
      throw new AppError(404, `Classroom with id ${id} was not found.`, 'CLASSROOM_NOT_FOUND');
    }

    if (payload.name !== undefined) {
      classroom.name = payload.name;
    }

    return repository.save(classroom);
  }

  public async delete(id: number): Promise<void> {
    const repository = AppDataSource.getRepository(ClassRoom);
    const classroom = await repository.findOneBy({ id });

    if (!classroom) {
      throw new AppError(404, `Classroom with id ${id} was not found.`, 'CLASSROOM_NOT_FOUND');
    }

    await repository.remove(classroom);
  }

  public async getStudentsByClassroomId(id: number): Promise<Student[]> {
    const classroom = await AppDataSource.getRepository(ClassRoom).findOneBy({ id });

    if (!classroom) {
      throw new AppError(404, `Classroom with id ${id} was not found.`, 'CLASSROOM_NOT_FOUND');
    }

    return AppDataSource.getRepository(Student).find({
      where: { classroom: { id } },
      order: { id: 'ASC' },
    });
  }
}

export const classroomService = new ClassroomService();
