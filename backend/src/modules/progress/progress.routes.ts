import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { Course, DailyActivity, RevisionItem, TopicStat, UserProgress } from '../../models';
import { courseProgressSummaries } from '../courses/courseMap';
import * as gx from '../gamification/engine';
import { weakTopics } from '../revision/revision.service';

export const progressRouter = Router();
progressRouter.use(requireAuth);

progressRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const profile = await gx.getProfile(u.oid);
    const courseIds = await UserProgress.distinct('courseId', { userId: u.oid });
    const courses = await Course.find({ _id: { $in: courseIds }, published: true }).select('title slug color icon').lean();
    const progressOf = await courseProgressSummaries(u.oid, courses.map((c) => c._id));
    const [topics, totalAnswered, revisionDue, mastered] = await Promise.all([
      TopicStat.find({ userId: u.oid, attempts: { $gt: 0 } }).sort({ attempts: -1 }).limit(20).lean(),
      DailyActivity.aggregate<{ answered: number; correct: number }>([
        { $match: { userId: u.oid } },
        { $group: { _id: null, answered: { $sum: '$questionsAnswered' }, correct: { $sum: '$correctAnswers' } } },
      ]),
      RevisionItem.countDocuments({ userId: u.oid, mastered: false, dueAt: { $lte: new Date() } }),
      RevisionItem.countDocuments({ userId: u.oid, mastered: true }),
    ]);
    const agg = totalAnswered[0];
    ok(res, {
      currentCourseId: profile.currentCourseId?.toString() ?? null,
      courses: courses.map((c) => ({ id: c._id.toString(), title: c.title, color: c.color, icon: c.icon, ...progressOf(c._id) })),
      accuracy: agg && agg.answered ? +(agg.correct / agg.answered).toFixed(2) : null,
      questionsAnswered: agg?.answered ?? 0,
      topicAccuracy: topics.map((t) => ({
        topic: t.topic,
        attempts: t.attempts,
        accuracy: t.attempts ? +(t.correct / t.attempts).toFixed(2) : 0,
      })),
      revision: { due: revisionDue, mastered },
      gamification: await gx.gamificationSummary(u.oid),
    });
  }),
);

progressRouter.get(
  '/me/weekly',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const profile = await gx.getProfile(u.oid);
    const days = await gx.weeklyActivity(u.oid, profile.timezone);
    ok(res, { days, totalXp: days.reduce((s, d) => s + d.xp, 0), goal: profile.dailyXpGoal * 5 });
  }),
);

progressRouter.get(
  '/me/weak-topics',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    ok(res, { topics: await weakTopics(u.oid, 8), source: 'performance_data' });
  }),
);
