import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './db';
import { logger } from './lib/logger';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`SkillSprint API listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, 'Failed to start server');
  process.exit(1);
});
