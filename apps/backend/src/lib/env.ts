import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .transform(Number)
    .default('3001'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  // AI Provider - Required for Phase 3+
  // Supports OpenAI direct or OpenRouter (set OPENAI_BASE_URL for OpenRouter)
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_BASE_URL: z.string().optional(), // e.g., https://openrouter.ai/api/v1
  OPENAI_MODEL: z.string().default('gpt-4o'),
  // Phase 4+ - Database
  // SUPABASE_URL: z.string().optional(),
  // SUPABASE_ANON_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
