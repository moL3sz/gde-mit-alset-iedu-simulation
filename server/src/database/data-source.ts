import 'reflect-metadata';
import { join } from 'node:path';

import { DataSource } from 'typeorm';

import { env } from '../config/env';
import { ClassRoom } from './entities/ClassRoom';
import { Student } from './entities/Student';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: env.DB_LOGGING,
  entities: [Student, ClassRoom],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
});
