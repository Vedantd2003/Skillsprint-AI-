import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from '../config/env';

const handler: Options['handler'] = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again shortly.',
      requestId: (req as Request).requestId,
    },
  });
};

const base = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  handler,
  skip: () => env.RATE_LIMIT_DISABLED,
};

const ip = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

/** Global safety net for all API routes. */
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300, keyGenerator: ip });

/** Brute-force protection for credential endpoints (per IP + email). */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 20,
  keyGenerator: (req) => `${ip(req)}:${String(req.body?.email ?? '').toLowerCase().slice(0, 254)}`,
});

/** Expensive AI endpoints: per authenticated user. */
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: () => env.AI_PER_MINUTE_LIMIT,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : ip(req)),
});

/** Factory used by tests to verify limiter behaviour without relying on globals. */
export const makeLimiter = (limit: number, windowMs = 60_000) =>
  rateLimit({ ...base, skip: () => false, windowMs, limit, keyGenerator: ip });
