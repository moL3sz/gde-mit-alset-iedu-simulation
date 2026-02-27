import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Student } from './Student';

@Entity({ name: 'classrooms' })
export class ClassRoom {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @OneToMany(() => Student, (student) => student.classroom)
  students!: Student[];
}
