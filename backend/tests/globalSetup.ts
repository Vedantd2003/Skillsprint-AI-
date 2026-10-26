import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';

/** Drops the test database and seeds curated content once for the whole run. */
export default async function setup() {
  const uri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/skillsprint_test';
  if (!/test/i.test(uri)) throw new Error(`Refusing to run tests against a non-test database: ${uri}`);
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  // Seed through the real CLI so the test DB matches production seeding exactly.
  const root = path.resolve(__dirname, '..');
  execFileSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/seed/seed.ts'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: uri,
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
      AI_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
    },
  });
}
