import { AppError } from '../../core/shared/errors/app-error';
import { AppDataSource } from '../../database/data-source';
import { ClassRoom } from '../../database/entities/ClassRoom';
import { Student } from '../../database/entities/Student';
import type { CreateStudentBody, UpdateStudentBody } from './student.schema';

export class StudentService {
  public async getAll(classroomId?: number): Promise<Student[]> {
    if (classroomId !== undefined) {
      return AppDataSource.getRepository(Student).find({
        where: { classroom: { id: classroomId } },
        relations: { classroom: true },
        order: { id: 'ASC' },
      });
    }

    return AppDataSource.getRepository(Student).find({
      relations: { classroom: true },
      order: { id: 'ASC' },
    });
  }

  public async getById(id: number): Promise<Student> {
    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id },
      relations: { classroom: true },
    });

    if (!student) {
      throw new AppError(404, `Student with id ${id} was not found.`, 'STUDENT_NOT_FOUND');
    }

    return student;
  }

  public async create(payload: CreateStudentBody): Promise<Student> {
    const repository = AppDataSource.getRepository(Student);
    const classroom = await this.resolveClassroom(payload.classroomId);
    const student = repository.create({
      name: payload.name,
      attentiveness: payload.attentiveness ?? 5,
      behavior: payload.behavior ?? 5,
      comprehension: payload.comprehension ?? 5,
      profile: payload.profile ?? undefined,
      classroom,
    });

    return repository.save(student);
  }

  public async update(id: number, payload: UpdateStudentBody): Promise<Student> {
    const repository = AppDataSource.getRepository(Student);
    const student = await repository.findOne({
      where: { id },
      relations: { classroom: true },
    });

    if (!student) {
      throw new AppError(404, `Student with id ${id} was not found.`, 'STUDENT_NOT_FOUND');
    }

    if (payload.name !== undefined) {
      student.name = payload.name;
    }

    if (payload.attentiveness !== undefined) {
      student.attentiveness = payload.attentiveness;
    }

    if (payload.behavior !== undefined) {
      student.behavior = payload.behavior;
    }

    if (payload.comprehension !== undefined) {
      student.comprehension = payload.comprehension;
    }

    if (payload.profile !== undefined) {
      student.profile = payload.profile;
    }

    if (payload.classroomId !== undefined) {
      student.classroom = await this.resolveClassroom(payload.classroomId);
    }

    return repository.save(student);
  }

  public async delete(id: number): Promise<void> {
    const repository = AppDataSource.getRepository(Student);
    const student = await repository.findOneBy({ id });

    if (!student) {
      throw new AppError(404, `Student with id ${id} was not found.`, 'STUDENT_NOT_FOUND');
    }

    await repository.remove(student);
  }

  private async resolveClassroom(classroomId?: number | null): Promise<ClassRoom | null> {
    if (classroomId === undefined || classroomId === null) {
      return null;
    }

    const classroom = await AppDataSource.getRepository(ClassRoom).findOneBy({ id: classroomId });

    if (!classroom) {
      throw new AppError(
        404,
        `Classroom with id ${classroomId} was not found.`,
        'CLASSROOM_NOT_FOUND',
      );
    }

    return classroom;
  }
}

export const studentService = new StudentService();
