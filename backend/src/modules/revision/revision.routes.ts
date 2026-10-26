import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import { asyncHandler, ok } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { body, objectId, query } from '../../middleware/validate';
import { DailyActivity, Question, RevisionItem, UserProfile, UserProgress } from '../../models';
import { env } from '../../config/env';
import * as gx from '../gamification/engine';
import { checkAnswer, InvalidAnswerError } from '../lessons/answerChecker';
import { toPublicQuestion } from '../lessons/publicQuestion';
import { recordRevisionOutcome, recordTopicResult } from './revision.service';

export const REVISION_SESSION_SIZE = 5;
export const revisionRouter = Router();
revisionRouter.use(requireAuth);

revisionRouter.get(
  '/due',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const q = query(
      req,
      z.object({ limit: z.coerce.number().int().min(1).max(30).default(10), topic: z.string().max(80).optional() }),
    );
    const filter: Record<string, unknown> = { userId: u.oid, mastered: false, dueAt: { $lte: new Date() } };
    if (q.topic) filter.topic = q.topic;
    const [items, dueCount, upcoming] = await Promise.all([
      RevisionItem.find(filter).sort({ dueAt: 1 }).limit(q.limit).lean(),
      RevisionItem.countDocuments({ userId: u.oid, mastered: false, dueAt: { $lte: new Date() } }),
      RevisionItem.findOne({ userId: u.oid, mastered: false, dueAt: { $gt: new Date() } }).sort({ dueAt: 1 }).lean(),
    ]);
    const questions = await Question.find({ _id: { $in: items.map((i) => i.questionId) } }).lean();
    const byId = new Map(questions.map((qq) => [qq._id.toString(), qq]));
    ok(res, {
      dueCount,
      nextDueAt: upcoming?.dueAt ?? null,
      items: items
        .filter((i) => byId.has(i.questionId.toString()))
        .map((i) => ({
          revisionItemId: i._id.toString(),
          topic: i.topic,
          wrongCount: i.wrongCount,
          lastPracticedAt: i.lastPracticedAt,
          question: toPublicQuestion(byId.get(i.questionId.toString())!),
        })),
    });
  }),
);

/** Practice a weak topic: mistakes first, then questions from lessons already studied. */
revisionRouter.get(
  '/practice',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const q = query(req, z.object({ topic: z.string().min(1).max(80), limit: z.coerce.number().int().min(1).max(15).default(8) }));
    const items = await RevisionItem.find({ userId: u.oid, topic: q.topic, mastered: false }).sort({ dueAt: 1 }).limit(q.limit).lean();
    const ids = items.map((i) => i.questionId);
    if (ids.length < q.limit) {
      const studied = await UserProgress.distinct('lessonId', { userId: u.oid });
      const extra = await Question.find({ topic: q.topic, lessonId: { $in: studied }, _id: { $nin: ids } })
        .limit(q.limit - ids.length)
        .select('_id')
        .lean();
      ids.push(...extra.map((e) => e._id));
    }
    const questions = await Question.find({ _id: { $in: ids } }).lean();
    ok(res, { topic: q.topic, questions: questions.map(toPublicQuestion) });
  }),
);

revisionRouter.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z
        .object({
          questionId: objectId,
          answer: z
            .union([
              z.number().int().min(0).max(100),
              z.boolean(),
              z.string().max(1000),
              z.array(z.union([z.string().max(100), z.number().int().min(0).max(100)])).max(30),
              z.object({ knew: z.boolean() }).strict(),
            ])
            .optional(),
          skip: z.boolean().optional(),
          sessionId: z.string().max(64).optional(),
        })
        .strict(),
    );
    // Only questions in this user's revision queue, or from lessons they have already
    // opened, can be practised here (no peeking at locked content's answers).
    const question = await Question.findById(b.questionId).select('+answer').lean();
    if (!question) throw notFound('Question');
    const allowed =
      (await RevisionItem.exists({ userId: u.oid, questionId: b.questionId })) ||
      (await UserProgress.exists({ userId: u.oid, lessonId: question.lessonId }));
    if (!allowed) throw notFound('Revision item');

    let result: { correct: boolean; correctAnswer: string };
    try {
      if (b.skip) {
        result = { correct: false, correctAnswer: '' };
      } else {
        if (b.answer === undefined) throw badRequest('Provide an answer or skip: true');
        result = checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, b.answer);
      }
    } catch (err) {
      if (err instanceof InvalidAnswerError) throw badRequest(err.message);
      throw err;
    }
    const outcome = b.skip ? 'skipped' : result.correct ? 'correct' : 'wrong';
    const profile = await gx.getProfile(u.oid);
    const updated = await recordRevisionOutcome(u.oid, question, outcome);
    await Promise.all([
      recordTopicResult(u.oid, question.topic, outcome),
      gx.incDaily(u.oid, profile.timezone, { revisionAnswered: b.skip ? 0 : 1, questionsAnswered: b.skip ? 0 : 1, correctAnswers: result.correct ? 1 : 0 }),
    ]);
    let xpEarned = 0;
    if (result.correct) {
      await gx.gainHeart(u.oid);
      await UserProfile.updateOne({ userId: u.oid }, { $inc: { 'gamification.revisionCorrect': 1 } });
      // Revision counts as learning activity for the streak.
      await gx.recordStreakActivity(u.oid);
    }
    // A daily revision session (5+ answers) earns a small bonus, once per day.
    const today = gx.todayFor(profile.timezone);
    const activity = await DailyActivity.findOne({ userId: u.oid, day: today }).lean();
    if ((activity?.revisionAnswered ?? 0) >= REVISION_SESSION_SIZE) {
      xpEarned += await gx.awardXp(u.oid, profile.timezone, env.XP_REVISION_SESSION, 'revision_session', `revision:${today}`);
    }
    xpEarned += await gx.evaluateDailyChallenge(u.oid, profile.timezone);
    const achievements = await gx.checkAchievements(u.oid);
    const hearts = await gx.syncHearts(u.oid);
    ok(res, {
      correct: result.correct,
      skipped: Boolean(b.skip),
      correctAnswer: result.correct ? result.correctAnswer : checkAnswerSafeReveal(question),
      explanation: question.explanation,
      nextDueAt: updated?.dueAt ?? null,
      mastered: updated?.mastered ?? false,
      hearts: hearts.hearts,
      xpEarned,
      achievements,
    });
  }),
);

function checkAnswerSafeReveal(question: { type: string; answer: unknown; data?: unknown }): string {
  const key = question.answer as Record<string, unknown>;
  const data = (question.data ?? {}) as Record<string, unknown>;
  switch (question.type) {
    case 'multiple_choice':
      return String((data.options as string[])?.[key.index as number] ?? '');
    case 'true_false':
      return key.value ? 'True' : 'False';
    case 'word_order':
      return ((key.order as string[]) ?? []).join(' ');
    case 'match_pairs': {
      const left = (data.left as string[]) ?? [];
      const right = (data.right as string[]) ?? [];
      return left.map((l, i) => `${l} → ${right[(key.mapping as number[])[i] ?? 0]}`).join(', ');
    }
    case 'flashcard':
      return String(data.back ?? '');
    default:
      return ((key.accepted as string[]) ?? (key.keywords as string[]) ?? [])[0] ?? '';
  }
}
