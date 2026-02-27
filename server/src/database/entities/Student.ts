import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClassRoom } from './ClassRoom';

export enum StudentProfile {
  ADHD = 'ADHD',
  Autistic = 'Autistic',
  Typical = 'Typical',
}

@Entity({ name: 'students' })
@Check(`"attentiveness" BETWEEN 0 AND 10`)
@Check(`"behavior" BETWEEN 0 AND 10`)
@Check(`"comprehension" BETWEEN 0 AND 10`)
export class Student {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'smallint', default: 5 })
  attentiveness!: number;

  @Column({ type: 'smallint', default: 5 })
  behavior!: number;

  @Column({ type: 'smallint', default: 5 })
  comprehension!: number;

  @Column({
    type: 'enum',
    enum: StudentProfile,
    default: StudentProfile.Typical,
  })
  profile!: StudentProfile;

  @ManyToOne(() => ClassRoom, (classroom) => classroom.students, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'classroom_id' })
  classroom!: ClassRoom | null;
}
