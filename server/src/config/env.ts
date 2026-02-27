import 'dotenv/config';

import { z } from 'zod';

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LLM_MODEL: z.string().trim().min(1).default('gpt-5-mini'),
  AZURE_OPENAI_API_KEY: optionalNonEmptyString,
  AZURE_OPENAI_ENDPOINT: optionalUrl,
  AZURE_OPENAI_DEPLOYMENT: optionalNonEmptyString,
  AZURE_OPENAI_API_VERSION: z.string().trim().min(1).default('2025-01-01-preview'),
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
