import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { weekKey } from '../../lib/dates';
import { authed, requireAuth } from '../../middleware/auth';
import { query } from '../../middleware/validate';
import { Achievement, Friendship, LeaderboardEntry, UserAchievement, UserProfile } from '../../models';
import * as gx from './engine';

/** Mounted at the API root, so auth is applied per route (unknown paths must still 404). */
export const gamificationRouter = Router();

gamificationRouter.get(
  '/gamification/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const summary = await gx.gamificationSummary(u.oid);
    const recent = await UserAchievement.find({ userId: u.oid }).sort({ unlockedAt: -1 }).limit(3).populate('achievementId').lean();
    ok(res, {
      ...summary,
      recentAchievements: recent.map((r) => {
        const a = r.achievementId as unknown as { code: string; title: string; description: string; icon: string };
        return { code: a.code, title: a.title, description: a.description, icon: a.icon, unlockedAt: r.unlockedAt };
      }),
    });
  }),
);

gamificationRouter.get(
  '/challenges/daily',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const profile = await gx.getProfile(u.oid);
    ok(res, await gx.challengeProgress(u.oid, profile.timezone));
  }),
);

gamificationRouter.get(
  '/achievements',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const profile = await gx.getProfile(u.oid);
    const g = profile.gamification!;
    const metrics: Record<string, number> = {
      lessonsCompleted: g.lessonsCompleted,
      currentStreak: g.currentStreak,
      totalXp: g.totalXp,
      perfectLessons: g.perfectLessons,
      unitsCompleted: g.unitsCompleted,
      tutorMessages: g.tutorMessages,
      revisionCorrect: g.revisionCorrect,
    };
    const [all, owned] = await Promise.all([
      Achievement.find().sort({ order: 1 }).lean(),
      UserAchievement.find({ userId: u.oid }).lean(),
    ]);
    const ownedMap = new Map(owned.map((o) => [o.achievementId.toString(), o.unlockedAt]));
    ok(
      res,
      all.map((a) => ({
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        threshold: a.threshold,
        progress: Math.min(metrics[a.metric] ?? 0, a.threshold),
        unlocked: ownedMap.has(a._id.toString()),
        unlockedAt: ownedMap.get(a._id.toString()) ?? null,
      })),
    );
  }),
);

/**
 * Leaderboards expose only display name, avatar seed, level and XP — never
 * emails or other account data. Learners can opt out via showOnLeaderboard.
 */
gamificationRouter.get(
  '/leaderboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const q = query(
      req,
      PaginationQuery.extend({ scope: z.enum(['weekly', 'alltime', 'friends']).default('weekly') }),
    );
    const me = await gx.getProfile(u.oid);
    const week = weekKey(gx.todayFor(me.timezone));

    let rows: { userId: string; xp: number }[] = [];
    let total = 0;
    const visible = await UserProfile.find({ showOnLeaderboard: true }).select('userId').lean();
    const visibleIds = visible.map((v) => v.userId);

    if (q.scope === 'weekly' || q.scope === 'friends') {
      const filter: Record<string, unknown> = { week, xp: { $gt: 0 } };
      if (q.scope === 'friends') {
        const friends = await Friendship.find({ userId: u.oid }).select('friendId').lean();
        filter.userId = { $in: [u.oid, ...friends.map((f) => f.friendId)] };
      } else {
        filter.userId = { $in: visibleIds };
      }
      const [entries, count] = await Promise.all([
        LeaderboardEntry.find(filter).sort({ xp: -1, updatedAt: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
        LeaderboardEntry.countDocuments(filter),
      ]);
      rows = entries.map((e) => ({ userId: e.userId.toString(), xp: e.xp }));
      total = count;
    } else {
      const filter = { showOnLeaderboard: true, 'gamification.totalXp': { $gt: 0 } };
      const [profiles, count] = await Promise.all([
        UserProfile.find(filter).sort({ 'gamification.totalXp': -1 }).skip((q.page - 1) * q.limit).limit(q.limit).select('userId gamification.totalXp').lean(),
        UserProfile.countDocuments(filter),
      ]);
      rows = profiles.map((p) => ({ userId: p.userId.toString(), xp: p.gamification?.totalXp ?? 0 }));
      total = count;
    }

    const profiles = await UserProfile.find({ userId: { $in: rows.map((r) => r.userId) } })
      .select('userId displayName avatarSeed gamification.level')
      .lean();
    const pById = new Map(profiles.map((p) => [p.userId.toString(), p]));
    const entries = rows.map((r, i) => ({
      rank: (q.page - 1) * q.limit + i + 1,
      displayName: pById.get(r.userId)?.displayName ?? 'Learner',
      avatarSeed: pById.get(r.userId)?.avatarSeed ?? '',
      level: pById.get(r.userId)?.gamification?.level ?? 1,
      xp: r.xp,
      isMe: r.userId === u.id,
    }));

    // My own rank for the selected scope.
    let myXp = 0;
    if (q.scope === 'alltime') myXp = me.gamification?.totalXp ?? 0;
    else myXp = (await LeaderboardEntry.findOne({ userId: u.oid, week }).lean())?.xp ?? 0;
    ok(res, { scope: q.scope, week, entries, me: { xp: myXp, displayName: me.displayName } }, 200, pageMeta(q.page, q.limit, total));
  }),
);
