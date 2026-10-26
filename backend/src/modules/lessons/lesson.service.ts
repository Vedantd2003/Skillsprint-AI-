import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { IdempotencyKey, Lesson, LessonAttempt, Question, Unit, UserProfile, UserProgress } from '../../models';
import { buildCourseMap } from '../courses/courseMap';
import * as gx from '../gamification/engine';
import { recordRevisionOutcome, recordTopicResult } from '../revision/revision.service';
import { checkAnswer, InvalidAnswerError } from './answerChecker';
import { toPublicQuestion } from './publicQuestion';

export const CHECKPOINT_PASS_SCORE = 0.7;

async function loadLesson(lessonId: Types.ObjectId) {
  const lesson = await Lesson.findOne({ _id: lessonId, published: true }).lean();
  if (!lesson) throw notFound('Lesson');
  return lesson;
}

export async function getLessonDetail(userId: Types.ObjectId, lessonId: Types.ObjectId) {
  const lesson = await loadLesson(lessonId);
  const [map, questionCount, progress] = await Promise.all([
    buildCourseMap(userId, lesson.courseId),
    Question.countDocuments({ lessonId }),
    UserProgress.findOne({ userId, lessonId }).lean(),
  ]);
  return {
    id: lesson._id.toString(),
    courseId: lesson.courseId.toString(),
    unitId: lesson.unitId.toString(),
    title: lesson.title,
    summary: lesson.summary,
    kind: lesson.kind,
    topic: lesson.topic,
    xpReward: lesson.xpReward,
    questionCount,
    status: map.statusOf(lesson._id.toString()),
    bestScore: progress?.bestScore ?? 0,
  };
}

export async function startLesson(userId: Types.ObjectId, lessonId: Types.ObjectId) {
  const lesson = await loadLesson(lessonId);
  const map = await buildCourseMap(userId, lesson.courseId);
  if (map.statusOf(lesson._id.toString()) === 'locked') {
    throw forbidden('Complete the previous lessons to unlock this one', 'LESSON_LOCKED');
  }
  const questions = await Question.find({ lessonId }).sort({ order: 1 }).lean();
  if (!questions.length) throw new AppError(409, 'LESSON_EMPTY', 'This lesson has no questions yet');

  // Resume an unfinished attempt instead of discarding progress.
  let attempt = await LessonAttempt.findOne({ userId, lessonId, status: 'in_progress' }).sort({ createdAt: -1 });
  const validIds = new Set(questions.map((q) => q._id.toString()));
  if (attempt && attempt.questionIds.some((id) => !validIds.has(id.toString()))) {
    // Content changed since the attempt began; start fresh.
    attempt.status = 'abandoned';
    await attempt.save();
    attempt = null;
  }
  if (!attempt) {
    attempt = await LessonAttempt.create({
      userId,
      lessonId,
      courseId: lesson.courseId,
      questionIds: questions.map((q) => q._id),
    });
    await UserProgress.updateOne(
      { userId, lessonId },
      { $setOnInsert: { courseId: lesson.courseId, unitId: lesson.unitId, status: 'started' }, $set: { lastPracticedAt: new Date() } },
      { upsert: true },
    );
  }
  await UserProfile.updateOne({ userId, currentCourseId: null }, { $set: { currentCourseId: lesson.courseId } });

  const hearts = await gx.syncHearts(userId);
  return {
    attempt: {
      id: attempt._id.toString(),
      answered: attempt.answers.map((a) => ({ questionId: a.questionId.toString(), correct: a.correct, skipped: a.skipped })),
    },
    lesson: { id: lesson._id.toString(), title: lesson.title, kind: lesson.kind, xpReward: lesson.xpReward, topic: lesson.topic },
    questions: questions.map(toPublicQuestion),
    hearts: { current: hearts.hearts, max: hearts.max, nextHeartAt: hearts.nextHeartAt, enabled: lesson.kind !== 'review' },
  };
}

async function loadOwnedAttempt(userId: Types.ObjectId, lessonId: Types.ObjectId, attemptId: Types.ObjectId) {
  // Ownership is enforced in the query: another user's attempt id simply isn't found.
  const attempt = await LessonAttempt.findOne({ _id: attemptId, userId, lessonId });
  if (!attempt) throw notFound('Lesson attempt');
  return attempt;
}

export async function submitAnswer(
  userId: Types.ObjectId,
  lessonId: Types.ObjectId,
  input: { attemptId: Types.ObjectId; questionId: Types.ObjectId; answer?: unknown; skip?: boolean },
) {
  const lesson = await loadLesson(lessonId);
  const attempt = await loadOwnedAttempt(userId, lessonId, input.attemptId);
  if (!attempt.questionIds.some((id) => id.equals(input.questionId))) throw badRequest('Question is not part of this lesson');

  const question = await Question.findById(input.questionId).select('+answer').lean();
  if (!question) throw notFound('Question');
  const total = attempt.questionIds.length;

  const previous = attempt.answers.find((a) => a.questionId.equals(input.questionId));
  const feedback = (correct: boolean, skipped: boolean, correctAnswer: string, hearts: number | null, alreadyAnswered: boolean) => ({
    correct,
    skipped,
    alreadyAnswered,
    correctAnswer,
    explanation: question.explanation,
    hearts,
    progress: { answered: Math.min(total, attempt.answers.length + (alreadyAnswered ? 0 : 1)), total },
  });

  // Idempotent: re-submitting an answered question returns the original result without side effects.
  if (previous) {
    const shown = previous.skipped
      ? checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, defaultAnswer(question.type, question.data))
      : checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, previous.given);
    return feedback(previous.correct, previous.skipped ?? false, shown.correctAnswer, null, true);
  }
  if (attempt.status !== 'in_progress') throw conflict('This lesson attempt is already finished', 'ATTEMPT_CLOSED');

  const heartsEnabled = lesson.kind !== 'review';
  if (heartsEnabled) {
    const h = await gx.syncHearts(userId);
    if (h.hearts <= 0) {
      throw new AppError(403, 'OUT_OF_HEARTS', 'You are out of hearts. Practise in Revision to earn them back — your lesson progress is saved.', {
        nextHeartAt: h.nextHeartAt,
      });
    }
  }

  const skipped = Boolean(input.skip);
  let result;
  try {
    result = skipped
      ? { correct: false, correctAnswer: checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, defaultAnswer(question.type, question.data)).correctAnswer }
      : checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, input.answer);
  } catch (err) {
    if (err instanceof InvalidAnswerError) throw badRequest(err.message);
    throw err;
  }

  // Atomic append guarded against concurrent duplicate submissions.
  const upd = await LessonAttempt.updateOne(
    { _id: attempt._id, status: 'in_progress', 'answers.questionId': { $ne: input.questionId } },
    {
      $push: { answers: { questionId: input.questionId, correct: result.correct, skipped, given: skipped ? null : input.answer } },
      $inc: { correctCount: result.correct ? 1 : 0 },
    },
  );
  if (upd.modifiedCount === 0) {
    const fresh = await loadOwnedAttempt(userId, lessonId, input.attemptId);
    const prev = fresh.answers.find((a) => a.questionId.equals(input.questionId));
    if (prev) return feedback(prev.correct, prev.skipped ?? false, result.correctAnswer, null, true);
    throw conflict('This lesson attempt is already finished', 'ATTEMPT_CLOSED');
  }

  let hearts: number | null = null;
  if (heartsEnabled && !result.correct && !skipped) hearts = await gx.spendHeart(userId);
  else if (heartsEnabled) hearts = (await gx.syncHearts(userId)).hearts;

  const outcome = skipped ? 'skipped' : result.correct ? 'correct' : 'wrong';
  const profile = await gx.getProfile(userId);
  await Promise.all([
    recordTopicResult(userId, question.topic, outcome),
    recordRevisionOutcome(userId, { _id: question._id, lessonId: question.lessonId, topic: question.topic }, outcome),
    gx.incDaily(userId, profile.timezone, { questionsAnswered: 1, correctAnswers: result.correct ? 1 : 0 }),
  ]);

  return feedback(result.correct, skipped, result.correctAnswer, hearts, false);
}

function defaultAnswer(type: string, data: unknown): unknown {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'multiple_choice':
      return 0;
    case 'true_false':
      return true;
    case 'word_order':
      return [];
    case 'match_pairs':
      return ((d.left as unknown[]) ?? []).map(() => 0);
    case 'flashcard':
      return { knew: false };
    default:
      return '';
  }
}

export async function completeLesson(userId: Types.ObjectId, lessonId: Types.ObjectId, attemptId: Types.ObjectId) {
  const lesson = await loadLesson(lessonId);
  const attempt = await loadOwnedAttempt(userId, lessonId, attemptId);
  if (attempt.status === 'completed' && attempt.result) return { ...(attempt.result as object), alreadyCompleted: true };
  if (attempt.status !== 'in_progress') throw conflict('This lesson attempt is no longer active', 'ATTEMPT_CLOSED');
  if (attempt.answers.length < attempt.questionIds.length) {
    throw conflict('Answer every question before finishing the lesson', 'LESSON_INCOMPLETE', {
      answered: attempt.answers.length,
      total: attempt.questionIds.length,
    });
  }

  // Claim completion via a unique idempotency key: exactly one concurrent request wins.
  // Duplicates wait for the winner's stored result and return it unchanged.
  try {
    await IdempotencyKey.create({ key: `complete:${attempt._id}`, userId });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    for (let i = 0; i < 50; i++) {
      const done = await LessonAttempt.findById(attempt._id).lean();
      if (done?.result) return { ...(done.result as object), alreadyCompleted: true };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw conflict('Lesson completion is still being processed', 'COMPLETION_IN_PROGRESS');
  }
  const claimed = await LessonAttempt.findOneAndUpdate(
    { _id: attempt._id },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true },
  );
  if (!claimed) throw notFound('Lesson attempt');

  const total = claimed.questionIds.length;
  const correct = claimed.answers.filter((a) => a.correct).length;
  const score = total ? correct / total : 0;
  const perfect = correct === total;
  const passed = lesson.kind !== 'checkpoint' || score >= CHECKPOINT_PASS_SCORE;

  const profile = await gx.getProfile(userId);
  const tz = profile.timezone;
  const before = await buildCourseMap(userId, lesson.courseId);

  const prior = await UserProgress.findOne({ userId, lessonId }).lean();
  const firstCompletion = passed && prior?.status !== 'completed';

  const xp: { reason: string; amount: number }[] = [];
  const push = (reason: string, amount: number) => amount > 0 && xp.push({ reason, amount });

  if (passed) {
    if (firstCompletion) {
      // Keyed by lesson id: XP for a lesson's first completion can only ever be granted once.
      push('Lesson complete', await gx.awardXp(userId, tz, lesson.xpReward || env.XP_LESSON_DEFAULT, 'lesson_first_completion', `lesson-first:${lessonId}`));
      if (perfect) push('Perfect lesson', await gx.awardXp(userId, tz, env.XP_PERFECT_BONUS, 'perfect_bonus', `perfect:${lessonId}`));
    } else {
      push('Practice', await gx.awardXp(userId, tz, env.XP_REPLAY, 'lesson_replay', `replay:${attempt._id}`));
    }
  }

  await UserProgress.updateOne(
    { userId, lessonId },
    {
      $setOnInsert: { courseId: lesson.courseId, unitId: lesson.unitId },
      $max: { bestScore: score },
      $set: {
        lastPracticedAt: new Date(),
        ...(passed ? { status: 'completed' } : {}),
        ...(firstCompletion ? { firstCompletedAt: new Date() } : {}),
      },
      $inc: { timesCompleted: passed ? 1 : 0 },
    },
    { upsert: true },
  );

  const counterInc: Record<string, number> = {};
  if (firstCompletion) counterInc['gamification.lessonsCompleted'] = 1;
  if (firstCompletion && perfect) counterInc['gamification.perfectLessons'] = 1;
  if (Object.keys(counterInc).length) await UserProfile.updateOne({ userId }, { $inc: counterInc });

  // Unit completion reward (ledger key guarantees once per unit).
  let unitCompleted: { id: string; title: string; rewardXp: number } | null = null;
  if (firstCompletion) {
    const after = await buildCourseMap(userId, lesson.courseId);
    const unit = after.units.find((u) => u.id === lesson.unitId.toString());
    if (unit?.completed) {
      const unitDoc = await Unit.findById(lesson.unitId).lean();
      const gained = await gx.awardXp(userId, tz, unitDoc?.rewardXp ?? 0, 'unit_completion', `unit:${lesson.unitId}`);
      if (gained > 0) {
        push('Unit complete', gained);
        await UserProfile.updateOne({ userId }, { $inc: { 'gamification.unitsCompleted': 1 } });
        unitCompleted = { id: unit.id, title: unit.title, rewardXp: gained };
      }
    }
  }

  await gx.incDaily(userId, tz, { lessonsCompleted: passed ? 1 : 0, perfectLessons: passed && perfect ? 1 : 0 });
  const streak = passed ? await gx.recordStreakActivity(userId) : null;
  const challengeXp = await gx.evaluateDailyChallenge(userId, tz);
  if (challengeXp > 0) push('Daily challenge', challengeXp);
  const achievements = await gx.checkAchievements(userId);

  const afterMap = await buildCourseMap(userId, lesson.courseId);
  const beforeLocked = new Set(before.units.flatMap((u) => u.lessons).filter((l) => l.status === 'locked').map((l) => l.id));
  const newlyUnlocked = afterMap.units
    .flatMap((u) => u.lessons)
    .filter((l) => beforeLocked.has(l.id) && l.status !== 'locked')
    .map((l) => ({ id: l.id, title: l.title, kind: l.kind }));

  const summary = await gx.gamificationSummary(userId);
  const result = {
    lessonId: lessonId.toString(),
    attemptId: attempt._id.toString(),
    passed,
    passScore: lesson.kind === 'checkpoint' ? CHECKPOINT_PASS_SCORE : null,
    score: +score.toFixed(2),
    correct,
    total,
    perfect,
    firstCompletion,
    xpEarned: xp.reduce((s, x) => s + x.amount, 0),
    xpBreakdown: xp,
    unitCompleted,
    newlyUnlocked,
    achievements,
    streak: streak ? { current: streak.currentStreak, longest: streak.longestStreak } : null,
    totals: { totalXp: summary.totalXp, level: summary.level, dailyXp: summary.daily.xp, dailyGoal: summary.daily.goal },
    nextLesson: afterMap.nextLesson,
  };
  await LessonAttempt.updateOne({ _id: attempt._id }, { $set: { result, correctCount: correct } });
  return { ...result, alreadyCompleted: false };
}
