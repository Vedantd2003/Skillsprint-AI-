import compression from 'compression';
import cors from 'cors';
import express, { type Request } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { isDbReady } from './db';
import { uuid } from './lib/crypto';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { adminRouter } from './modules/admin/admin.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { authRouter } from './modules/auth/auth.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { gamificationRouter } from './modules/gamification/gamification.routes';
import { lessonsRouter } from './modules/lessons/lessons.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { progressRouter } from './modules/progress/progress.routes';
import { revisionRouter } from './modules/revision/revision.routes';
import { friendsRouter } from './modules/social/friends.routes';
import { openApiDocument } from './openapi';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : uuid();
    res.setHeader('x-request-id', req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId ?? uuid(),
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }) },
    }),
  );

  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      // Native mobile apps don't send an Origin header; browsers must be on the allow-list.
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use(mongoSanitize({ replaceWith: '_' }));

  app.get('/health', (_req, res) => {
    const db = isDbReady();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db: db ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) });
  });

  const v1 = express.Router();
  v1.use(apiLimiter);
  v1.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  v1.use('/auth', authRouter);
  v1.use('/courses', coursesRouter);
  v1.use('/lessons', lessonsRouter);
  v1.use('/progress', progressRouter);
  v1.use('/revision', revisionRouter);
  v1.use('/ai', aiRouter);
  v1.use('/profile', profileRouter);
  v1.use('/friends', friendsRouter);
  v1.use('/admin', adminRouter);
  v1.use('/', gamificationRouter); // /gamification/me, /leaderboard, /achievements, /challenges/daily
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
