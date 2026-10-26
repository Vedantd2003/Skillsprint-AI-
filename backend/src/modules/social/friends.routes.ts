import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import { asyncHandler, ok } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { body, idParam, params } from '../../middleware/validate';
import { Friendship, UserProfile } from '../../models';

/** Optional friend connections via shareable friend codes (no emails exchanged). */
export const friendsRouter = Router();
friendsRouter.use(requireAuth);

friendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const links = await Friendship.find({ userId: u.oid }).lean();
    const profiles = await UserProfile.find({ userId: { $in: links.map((l) => l.friendId) } })
      .select('userId displayName avatarSeed gamification.level gamification.currentStreak')
      .lean();
    ok(
      res,
      profiles.map((p) => ({
        id: p.userId.toString(),
        displayName: p.displayName,
        avatarSeed: p.avatarSeed,
        level: p.gamification?.level ?? 1,
        streak: p.gamification?.currentStreak ?? 0,
      })),
    );
  }),
);

friendsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { friendCode } = body(req, z.object({ friendCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/) }).strict());
    const friend = await UserProfile.findOne({ friendCode }).lean();
    if (!friend) throw notFound('Learner with that friend code');
    if (friend.userId.equals(u.oid)) throw badRequest('That is your own friend code');
    await Promise.all([
      Friendship.updateOne({ userId: u.oid, friendId: friend.userId }, { $setOnInsert: {} }, { upsert: true }),
      Friendship.updateOne({ userId: friend.userId, friendId: u.oid }, { $setOnInsert: {} }, { upsert: true }),
    ]);
    ok(res, { id: friend.userId.toString(), displayName: friend.displayName }, 201);
  }),
);

friendsRouter.delete(
  '/:friendId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { friendId } = params(req, idParam('friendId'));
    await Friendship.deleteMany({
      $or: [
        { userId: u.oid, friendId },
        { userId: friendId, friendId: u.oid },
      ],
    });
    ok(res, { removed: true });
  }),
);
