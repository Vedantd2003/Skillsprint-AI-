import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // AI
  AI_PROVIDER: z.enum(['gemini', 'mock']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(60),
  AI_PER_MINUTE_LIMIT: z.coerce.number().int().positive().default(10),
  AI_INPUT_COST_PER_MTOK: z.coerce.number().nonnegative().default(0.3),
  AI_OUTPUT_COST_PER_MTOK: z.coerce.number().nonnegative().default(2.5),
  AI_MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(180),

  // Gamification (configurable rewards & limits)
  XP_LESSON_DEFAULT: z.coerce.number().int().nonnegative().default(15),
  XP_PERFECT_BONUS: z.coerce.number().int().nonnegative().default(5),
  XP_REPLAY: z.coerce.number().int().nonnegative().default(3),
  XP_AI_QUIZ: z.coerce.number().int().nonnegative().default(8),
  XP_REVISION_SESSION: z.coerce.number().int().nonnegative().default(5),
  HEARTS_MAX: z.coerce.number().int().positive().default(5),
  HEART_REFILL_MINUTES: z.coerce.number().int().positive().default(30),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),

  RATE_LIMIT_DISABLED: bool.default('false'),
  EXPOSE_DEV_RESET_TOKEN: bool.default('false'),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Never print values, only which variables are invalid.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.EXPOSE_DEV_RESET_TOKEN) {
    throw new Error('EXPOSE_DEV_RESET_TOKEN must not be enabled in production');
  }
  return env;
}

export const env = load();
