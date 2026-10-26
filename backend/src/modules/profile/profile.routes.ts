import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/errors';
import { isValidTimeZone } from '../../lib/dates';
import { asyncHandler, ok } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { body } from '../../middleware/validate';
import {
  AIConversation,
  AIMessage,
  AIQuiz,
  AIUsage,
  Course,
  DailyActivity,
  Friendship,
  LeaderboardEntry,
  LessonAttempt,
  NotificationPreference,
  PasswordResetToken,
  RefreshToken,
  RevisionItem,
  TopicStat,
  User,
  UserAchievement,
  UserProfile,
  UserProgress,
  XPTransaction,
} from '../../models';
import { OnboardingSchema } from '../auth/auth.routes';
import { levelProgress } from '../gamification/levels';

export const profileRouter = Router();
profileRouter.use(requireAuth);

async function serializeProfile(userId: import('mongoose').Types.ObjectId) {
  const [user, profile, notifications] = await Promise.all([
    User.findById(userId).lean(),
    UserProfile.findOne({ userId }).lean(),
    NotificationPreference.findOne({ userId }).lean(),
  ]);
  if (!user || !profile) throw notFound('Profile');
  const g = profile.gamification!;
  return {
    id: user._id.toString(),
    email: user.email, // only ever returned to the account owner
    role: user.role,
    displayName: profile.displayName,
    avatarSeed: profile.avatarSeed,
    friendCode: profile.friendCode,
    uiLanguage: profile.uiLanguage,
    tutorLanguage: profile.tutorLanguage,
    learningGoal: profile.learningGoal,
    interests: profile.interests,
    skillLevel: profile.skillLevel,
    dailyXpGoal: profile.dailyXpGoal,
    timezone: profile.timezone,
    currentCourseId: profile.currentCourseId?.toString() ?? null,
    onboardingComplete: profile.onboardingComplete,
    showOnLeaderboard: profile.showOnLeaderboard,
    preferences: profile.preferences,
    notifications: notifications
      ? {
          remindersEnabled: notifications.remindersEnabled,
          reminderHour: notifications.reminderHour,
          reminderMinute: notifications.reminderMinute,
          streakAlerts: notifications.streakAlerts,
          weeklySummary: notifications.weeklySummary,
        }
      : null,
    stats: {
      totalXp: g.totalXp,
      ...levelProgress(g.totalXp),
      currentStreak: g.currentStreak,
      longestStreak: g.longestStreak,
      lessonsCompleted: g.lessonsCompleted,
      perfectLessons: g.perfectLessons,
    },
    createdAt: user.createdAt,
  };
}

profileRouter.get(
  '/me',
  asyncHandler(async (req, res) => ok(res, await serializeProfile(authed(req).oid))),
);

const PatchBody = OnboardingSchema.extend({
  displayName: z.string().trim().min(2).max(30).regex(/^[\p{L}\p{N} _.-]+$/u).optional(),
  currentCourseId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  onboardingComplete: z.boolean().optional(),
  showOnLeaderboard: z.boolean().optional(),
  preferences: z
    .object({
      theme: z.enum(['system', 'light', 'dark']).optional(),
      sound: z.boolean().optional(),
      animations: z.boolean().optional(),
      haptics: z.boolean().optional(),
    })
    .strict()
    .optional(),
  notifications: z
    .object({
      remindersEnabled: z.boolean().optional(),
      reminderHour: z.number().int().min(0).max(23).optional(),
      reminderMinute: z.number().int().min(0).max(59).optional(),
      streakAlerts: z.boolean().optional(),
      weeklySummary: z.boolean().optional(),
    })
    .strict()
    .optional(),
}).strict();

profileRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(req, PatchBody);
    const set: Record<string, unknown> = {};
    const { preferences, notifications, currentCourseId, timezone, ...rest } = b;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) set[k] = v;
    if (timezone !== undefined) {
      if (!isValidTimeZone(timezone)) throw new AppError(400, 'BAD_REQUEST', 'Unknown timezone');
      set.timezone = timezone;
    }
    if (currentCourseId !== undefined) {
      if (currentCourseId && !(await Course.exists({ _id: currentCourseId, published: true }))) throw notFound('Course');
      set.currentCourseId = currentCourseId;
    }
    if (preferences) for (const [k, v] of Object.entries(preferences)) if (v !== undefined) set[`preferences.${k}`] = v;
    if (Object.keys(set).length) await UserProfile.updateOne({ userId: u.oid }, { $set: set });
    if (notifications) {
      const ns: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(notifications)) if (v !== undefined) ns[k] = v;
      await NotificationPreference.updateOne({ userId: u.oid }, { $set: ns }, { upsert: true });
    }
    ok(res, await serializeProfile(u.oid));
  }),
);

/**
 * Permanently deletes the account and all personal data. Requires the
 * current password as confirmation.
 */
profileRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { password } = body(req, z.object({ password: z.string().min(1).max(128) }).strict());
    const user = await User.findById(u.oid).select('+passwordHash');
    if (!user) throw notFound('Account');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
    }
    const userId = u.oid;
    await Promise.all([
      UserProfile.deleteMany({ userId }),
      NotificationPreference.deleteMany({ userId }),
      RefreshToken.deleteMany({ userId }),
      PasswordResetToken.deleteMany({ userId }),
      LessonAttempt.deleteMany({ userId }),
      UserProgress.deleteMany({ userId }),
      TopicStat.deleteMany({ userId }),
      RevisionItem.deleteMany({ userId }),
      DailyActivity.deleteMany({ userId }),
      XPTransaction.deleteMany({ userId }),
      UserAchievement.deleteMany({ userId }),
      LeaderboardEntry.deleteMany({ userId }),
      AIConversation.deleteMany({ userId }),
      AIMessage.deleteMany({ userId }),
      AIQuiz.deleteMany({ userId }),
      AIUsage.deleteMany({ userId }),
      Friendship.deleteMany({ $or: [{ userId }, { friendId: userId }] }),
    ]);
    await User.deleteOne({ _id: userId });
    ok(res, { deleted: true });
  }),
);
