import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { friendCode, randomToken, sha256, uuid } from '../../lib/crypto';
import { isValidTimeZone } from '../../lib/dates';
import { AppError, conflict, unauthorized } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { signAccessToken } from '../../middleware/auth';
import {
  NotificationPreference,
  PasswordResetToken,
  RefreshToken,
  User,
  UserProfile,
} from '../../models';

export interface OnboardingInput {
  uiLanguage?: 'en' | 'hi' | 'mr';
  tutorLanguage?: string;
  learningGoal?: string;
  interests?: string[];
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  dailyXpGoal?: number;
  timezone?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
}

// Constant-time-ish dummy hash so unknown emails cost the same as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

async function issueTokens(userId: Types.ObjectId, role: 'learner' | 'admin', familyId: string = uuid(), userAgent?: string): Promise<TokenPair> {
  const refreshToken = randomToken();
  await RefreshToken.create({
    userId,
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: userAgent?.slice(0, 200),
  });
  return {
    accessToken: signAccessToken(userId.toString(), role),
    refreshToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL,
  };
}

async function uniqueFriendCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = friendCode();
    if (!(await UserProfile.exists({ friendCode: code }))) return code;
  }
  return friendCode(10);
}

export async function register(
  input: { email: string; password: string; displayName: string; onboarding?: OnboardingInput },
  userAgent?: string,
) {
  const email = input.email.toLowerCase().trim();
  if (await User.exists({ email })) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  let user;
  try {
    user = await User.create({ email, passwordHash });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }

  const ob = input.onboarding ?? {};
  try {
    await UserProfile.create({
      userId: user._id,
      displayName: input.displayName.trim(),
      friendCode: await uniqueFriendCode(),
      uiLanguage: ob.uiLanguage ?? 'en',
      tutorLanguage: ob.tutorLanguage ?? ob.uiLanguage ?? 'en',
      learningGoal: ob.learningGoal ?? 'general',
      interests: ob.interests ?? [],
      skillLevel: ob.skillLevel ?? 'beginner',
      dailyXpGoal: ob.dailyXpGoal ?? 30,
      timezone: ob.timezone && isValidTimeZone(ob.timezone) ? ob.timezone : env.DEFAULT_TIMEZONE,
      onboardingComplete: Boolean(input.onboarding),
      gamification: { hearts: env.HEARTS_MAX },
    });
    await NotificationPreference.create({ userId: user._id });
  } catch (err) {
    // Keep data consistent if profile creation fails.
    await Promise.all([User.deleteOne({ _id: user._id }), UserProfile.deleteOne({ userId: user._id })]);
    throw err;
  }

  const tokens = await issueTokens(user._id, 'learner', undefined, userAgent);
  return { user: { id: user._id.toString(), email, role: 'learner' as const }, tokens };
}

export async function login(emailRaw: string, password: string, userAgent?: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  const tokens = await issueTokens(user._id, user.role, undefined, userAgent);
  return { user: { id: user._id.toString(), email: user.email, role: user.role }, tokens };
}

/**
 * Refresh-token rotation with reuse detection: each refresh token is single
 * use. Presenting an already-rotated token revokes the whole token family
 * (likely theft), forcing the user to sign in again.
 */
export async function refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
  const tokenHash = sha256(refreshToken);
  const now = new Date();
  // Atomically claim the token so concurrent refreshes can't both succeed.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: false },
  );
  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (existing?.revokedAt) {
      await RefreshToken.updateMany(
        { userId: existing.userId, familyId: existing.familyId, revokedAt: null },
        { $set: { revokedAt: now } },
      );
      logger.warn({ userId: existing.userId.toString() }, 'Refresh token reuse detected; family revoked');
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired. Please sign in again.');
  }
  const user = await User.findById(claimed.userId);
  if (!user) throw unauthorized('Account no longer exists');
  const tokens = await issueTokens(user._id, user.role, claimed.familyId, userAgent);
  await RefreshToken.updateOne({ _id: claimed._id }, { $set: { replacedByHash: sha256(tokens.refreshToken) } });
  return tokens;
}

export async function logout(refreshToken: string) {
  const existing = await RefreshToken.findOne({ tokenHash: sha256(refreshToken) });
  if (existing) {
    await RefreshToken.updateMany(
      { userId: existing.userId, familyId: existing.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}

export async function forgotPassword(emailRaw: string): Promise<string | null> {
  const user = await User.findOne({ email: emailRaw.toLowerCase().trim() });
  if (!user) return null;
  const token = randomToken(32);
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  // Email delivery is pluggable. Without a mail provider configured we only log in non-production.
  if (env.NODE_ENV !== 'production') logger.info({ userId: user._id.toString() }, 'Password reset token issued (dev): see response/devResetToken when enabled');
  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!record) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await User.updateOne({ _id: record.userId }, { $set: { passwordHash, passwordChangedAt: new Date() } });
  // Sign out everywhere.
  await RefreshToken.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
