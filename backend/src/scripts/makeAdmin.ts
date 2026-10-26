/** Promote an existing account to administrator: npm run make-admin -- someone@example.com */
import mongoose from 'mongoose';
import { connectDb } from '../db';
import { User } from '../models';

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) throw new Error('Usage: npm run make-admin -- <email>');
  await connectDb();
  const res = await User.updateOne({ email }, { $set: { role: 'admin' } });
  if (!res.matchedCount) throw new Error(`No account found for ${email}`);
  console.log(`${email} is now an admin. They must sign in again to receive an admin token.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
