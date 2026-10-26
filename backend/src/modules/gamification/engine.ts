import { Types } from 'mongoose';
import { env } from '../../config/env';
import { addDays, dayKey, weekKey, weekStart } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import {
  Achievement,
  DailyActivity,
  DailyChallenge,
  LeaderboardEntry,
  UserAchievement,
  UserProfile,
  XPTransaction,
} from '../../models';
import { regenerate, nextHeartAt } from './hearts';
import { levelForXp, levelProgress } from './levels';
import { applyActivity, effectiveStreak, streakAtRisk } from './streak';

type Oid = Types.ObjectId;
type XpReason =
  | 'lesson_first_completion'
  | 'lesson_replay'
  | 'perfect_bonus'
  | 'unit_completion'
  | 'daily_challenge'
  | 'ai_quiz'
  | 'revision_session'
  | 'admin_adjustment';

export async function getProfile(userId: Oid) {
  const profile = await UserProfile.findOne({ userId });
  if (!profile) throw notFound('Profile');
  return profile;
}

export const todayFor = (timezone: string, now = new Date()) => dayKey(now, timezone);

/**
 * Idempotent XP award. Inserts a ledger row keyed by (userId, sourceKey); if the
 * row already exists the award is a no-op and 0 is returned. Only after a
 * successful insert are the cached totals, daily activity and leaderboard
 * incremented — so duplicated/retried requests can never double-count.
 */
export async function awardXp(userId: Oid, timezone: string, amount: number, reason: XpReason, sourceKey: string): Promise<number> {
  if (amount <= 0) return 0;
  const day = todayFor(timezone);
  const week = weekKey(day);
  try {
    await XPTransaction.create({ userId, amount, reason, sourceKey, day, week });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 0;
    throw err;
  }
  const updated = await UserProfile.findOneAndUpdate(
    { userId },
    { $inc: { 'gamification.totalXp': amount } },
    { new: true },
  );
  await Promise.all([
    DailyActivity.updateOne({ userId, day }, { $inc: { xp: amount } }, { upsert: true }),
    LeaderboardEntry.updateOne({ userId, week }, { $inc: { xp: amount } }, { upsert: true }),
  ]);
  if (updated) {
    const level = levelForXp(updated.gamification?.totalXp ?? 0);
    if (level !== updated.gamification?.level) await UserProfile.updateOne({ userId }, { $set: { 'gamification.level': level } });
  }
  return amount;
}

/** Recomputes cached XP from the ledger (repair tool for partial failures). */
export async function reconcileXp(userId: Oid) {
  const [agg] = await XPTransaction.aggregate<{ total: number }>([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const total = agg?.total ?? 0;
  await UserProfile.updateOne({ userId }, { $set: { 'gamification.totalXp': total, 'gamification.level': levelForXp(total) } });
  return total;
}

export async function incDaily(
  userId: Oid,
  timezone: string,
  inc: Partial<Record<'lessonsCompleted' | 'perfectLessons' | 'questionsAnswered' | 'correctAnswers' | 'revisionAnswered', number>>,
) {
  await DailyActivity.updateOne({ userId, day: todayFor(timezone) }, { $inc: inc }, { upsert: true });
}

/** Marks today as an active learning day and updates the streak. */
export async function recordStreakActivity(userId: Oid) {
  const profile = await getProfile(userId);
  const g = profile.gamification!;
  const today = todayFor(profile.timezone);
  const next = applyActivity(
    { currentStreak: g.currentStreak, longestStreak: g.longestStreak, lastActiveDay: g.lastActiveDay ?? null },
    today,
  );
  if (next.lastActiveDay !== g.lastActiveDay || next.currentStreak !== g.currentStreak) {
    await UserProfile.updateOne(
      { userId },
      {
        $set: {
          'gamification.currentStreak': next.currentStreak,
          'gamification.longestStreak': next.longestStreak,
          'gamification.lastActiveDay': next.lastActiveDay,
        },
      },
    );
  }
  return next;
}

// ---------- Hearts ----------

export async function syncHearts(userId: Oid) {
  const profile = await getProfile(userId);
  const g = profile.gamification!;
  const now = new Date();
  const next = regenerate({ hearts: g.hearts, heartsUpdatedAt: g.heartsUpdatedAt ?? now }, now, env.HEARTS_MAX, env.HEART_REFILL_MINUTES);
  if (next.hearts !== g.hearts || +next.heartsUpdatedAt !== +(g.heartsUpdatedAt ?? 0)) {
    await UserProfile.updateOne(
      { userId },
      { $set: { 'gamification.hearts': next.hearts, 'gamification.heartsUpdatedAt': next.heartsUpdatedAt } },
    );
  }
  return { ...next, max: env.HEARTS_MAX, nextHeartAt: nextHeartAt(next, env.HEARTS_MAX, env.HEART_REFILL_MINUTES) };
}

/** Atomically spends one heart. Returns remaining hearts, or null if none were available. */
export async function spendHeart(userId: Oid): Promise<number | null> {
  const state = await syncHearts(userId);
  if (state.hearts <= 0) return null;
  const set = state.hearts >= env.HEARTS_MAX ? { 'gamification.heartsUpdatedAt': new Date() } : {};
  const updated = await UserProfile.findOneAndUpdate(
    { userId, 'gamification.hearts': { $gt: 0 } },
    { $inc: { 'gamification.hearts': -1 }, $set: set },
    { new: true },
  );
  return updated ? updated.gamification!.hearts : null;
}

export async function gainHeart(userId: Oid) {
  await syncHearts(userId);
  await UserProfile.updateOne(
    { userId, 'gamification.hearts': { $lt: env.HEARTS_MAX } },
    { $inc: { 'gamification.hearts': 1 } },
  );
}

// ---------- Achievements ----------

export async function checkAchievements(userId: Oid) {
  const profile = await getProfile(userId);
  const stats = profile.gamification!;
  const metrics: Record<string, number> = {
    lessonsCompleted: stats.lessonsCompleted,
    currentStreak: stats.currentStreak,
    totalXp: stats.totalXp,
    perfectLessons: stats.perfectLessons,
    unitsCompleted: stats.unitsCompleted,
    tutorMessages: stats.tutorMessages,
    revisionCorrect: stats.revisionCorrect,
  };
  const [all, owned] = await Promise.all([
    Achievement.find().lean(),
    UserAchievement.find({ userId }).select('achievementId').lean(),
  ]);
  const ownedIds = new Set(owned.map((o) => o.achievementId.toString()));
  const unlocked = [];
  for (const a of all) {
    if (ownedIds.has(a._id.toString())) continue;
    if ((metrics[a.metric] ?? 0) >= a.threshold) {
      try {
        await UserAchievement.create({ userId, achievementId: a._id });
        unlocked.push({ code: a.code, title: a.title, description: a.description, icon: a.icon });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
  }
  return unlocked;
}

// ---------- Daily challenges ----------

const CHALLENGE_TEMPLATES = [
  { type: 'earn_xp', title: 'XP Sprint', description: 'Earn 40 XP today', target: 40, bonusXp: 15 },
  { type: 'complete_lessons', title: 'Double Down', description: 'Complete 2 lessons today', target: 2, bonusXp: 15 },
  { type: 'revision_answers', title: 'Memory Gym', description: 'Answer 5 revision questions', target: 5, bonusXp: 10 },
  { type: 'perfect_lesson', title: 'Flawless', description: 'Finish a lesson with no mistakes', target: 1, bonusXp: 20 },
  { type: 'complete_lessons', title: 'Warm-up', description: 'Complete 1 lesson today', target: 1, bonusXp: 10 },
] as const;

export async function getDailyChallenge(day: string) {
  const idx = Math.abs([...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % CHALLENGE_TEMPLATES.length;
  const t = CHALLENGE_TEMPLATES[idx]!;
  return DailyChallenge.findOneAndUpdate(
    { day },
    { $setOnInsert: { day, ...t } },
    { upsert: true, new: true },
  );
}

export async function challengeProgress(userId: Oid, timezone: string) {
  const day = todayFor(timezone);
  const [challenge, activity, claimed] = await Promise.all([
    getDailyChallenge(day),
    DailyActivity.findOne({ userId, day }).lean(),
    XPTransaction.exists({ userId, sourceKey: `challenge:${day}` }),
  ]);
  const value =
    challenge!.type === 'earn_xp'
      ? activity?.xp ?? 0
      : challenge!.type === 'complete_lessons'
        ? activity?.lessonsCompleted ?? 0
        : challenge!.type === 'revision_answers'
          ? activity?.revisionAnswered ?? 0
          : activity?.perfectLessons ?? 0;
  return {
    day,
    type: challenge!.type,
    title: challenge!.title,
    description: challenge!.description,
    target: challenge!.target,
    bonusXp: challenge!.bonusXp,
    progress: Math.min(value, challenge!.target),
    completed: value >= challenge!.target,
    rewardClaimed: Boolean(claimed),
  };
}

/** Awards the daily challenge bonus once, when the target is reached. */
export async function evaluateDailyChallenge(userId: Oid, timezone: string) {
  const c = await challengeProgress(userId, timezone);
  if (!c.completed || c.rewardClaimed) return 0;
  return awardXp(userId, timezone, c.bonusXp, 'daily_challenge', `challenge:${c.day}`);
}

// ---------- Summary ----------

export async function weeklyActivity(userId: Oid, timezone: string) {
  const today = todayFor(timezone);
  const start = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rows = await DailyActivity.find({ userId, day: { $in: days } }).lean();
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((d) => ({
    day: d,
    xp: byDay.get(d)?.xp ?? 0,
    lessonsCompleted: byDay.get(d)?.lessonsCompleted ?? 0,
    isToday: d === today,
    isFuture: d > today,
  }));
}

export async function gamificationSummary(userId: Oid) {
  const hearts = await syncHearts(userId);
  const profile = await getProfile(userId);
  const g = profile.gamification!;
  const today = todayFor(profile.timezone);
  const streakState = { currentStreak: g.currentStreak, longestStreak: g.longestStreak, lastActiveDay: g.lastActiveDay ?? null };
  const [todayActivity, week, challenge] = await Promise.all([
    DailyActivity.findOne({ userId, day: today }).lean(),
    weeklyActivity(userId, profile.timezone),
    challengeProgress(userId, profile.timezone),
  ]);
  const weeklyXp = week.reduce((s, d) => s + d.xp, 0);
  return {
    totalXp: g.totalXp,
    ...levelProgress(g.totalXp),
    streak: {
      current: effectiveStreak(streakState, today),
      longest: g.longestStreak,
      activeToday: g.lastActiveDay === today,
      atRisk: streakAtRisk(streakState, today),
      timezone: profile.timezone,
    },
    hearts: { current: hearts.hearts, max: hearts.max, nextHeartAt: hearts.nextHeartAt },
    daily: { xp: todayActivity?.xp ?? 0, goal: profile.dailyXpGoal, met: (todayActivity?.xp ?? 0) >= profile.dailyXpGoal },
    weekly: { xp: weeklyXp, goal: profile.dailyXpGoal * 5, days: week },
    challenge,
    stats: {
      lessonsCompleted: g.lessonsCompleted,
      perfectLessons: g.perfectLessons,
      unitsCompleted: g.unitsCompleted,
    },
  };
}
