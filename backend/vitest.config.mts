import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/skillsprint_test',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
      AI_PROVIDER: 'mock',
      GEMINI_API_KEY: '',
      BCRYPT_ROUNDS: '4',
      RATE_LIMIT_DISABLED: 'true',
      EXPOSE_DEV_RESET_TOKEN: 'true',
      AI_DAILY_REQUEST_LIMIT: '25',
      LOG_LEVEL: 'silent',
    },
  },
});
