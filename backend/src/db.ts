import mongoose from 'mongoose';
import { env } from './config/env';
import { logger } from './lib/logger';
import * as models from './models';

// Unknown filter fields are dropped. NoSQL-injection defence lives at the edge:
// every input is zod-validated to primitive types and `$`/`.` keys are stripped
// by express-mongo-sanitize before reaching any query.
mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 20 });
  logger.info('MongoDB connected');
  await syncIndexes();
}

export async function syncIndexes() {
  for (const value of Object.values(models)) {
    if (typeof value === 'function' && 'createIndexes' in value) {
      const model = value as unknown as mongoose.Model<unknown>;
      try {
        await model.createIndexes();
      } catch (err) {
        // MongoDB-compatible engines used for local dev (e.g. FerretDB) may lack TTL
        // support. Atlas supports everything; any other index error is fatal.
        if (/not implemented/i.test((err as Error).message)) {
          logger.warn({ model: model.modelName, reason: (err as Error).message }, 'Index option unsupported by this database; skipped');
          for (const [fields, opts] of model.schema.indexes()) {
            if (opts && 'expireAfterSeconds' in opts) continue;
            await model.collection.createIndex(fields as mongoose.mongo.IndexSpecification, opts as mongoose.mongo.CreateIndexesOptions);
          }
        } else {
          throw err;
        }
      }
    }
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const isDbReady = () => mongoose.connection.readyState === 1;
