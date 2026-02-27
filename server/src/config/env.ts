import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LLM_API_KEY: z.string().trim().min(1).optional(),
  LLM_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
  DB_HOST: z.string().trim(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().trim(),
  DB_PASSWORD: z.string().trim(),
  DB_NAME: z.string().trim(),
  DB_LOGGING: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
