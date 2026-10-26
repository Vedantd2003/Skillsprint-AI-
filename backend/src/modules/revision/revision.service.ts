import { Types } from 'mongoose';
import { RevisionItem, TopicStat } from '../../models';
import { schedule, type SrsOutcome } from './srs';

interface QuestionRef {
  _id: Types.ObjectId;
  lessonId: Types.ObjectId;
  topic: string;
}

/** Records real performance on a topic (used for weak-topic detection and AI personalisation). */
export async function recordTopicResult(userId: Types.ObjectId, topic: string, outcome: SrsOutcome) {
  await TopicStat.updateOne(
    { userId, topic },
    {
      $inc: {
        attempts: outcome === 'skipped' ? 0 : 1,
        correct: outcome === 'correct' ? 1 : 0,
        skipped: outcome === 'skipped' ? 1 : 0,
      },
      $set: { lastPracticedAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * Updates the spaced-repetition queue after an answer.
 * Wrong/skipped answers always enter (or re-enter) the queue. Correct answers
 * only advance items that are already being reviewed.
 */
export async function recordRevisionOutcome(userId: Types.ObjectId, q: QuestionRef, outcome: SrsOutcome) {
  const now = new Date();
  const existing = await RevisionItem.findOne({ userId, questionId: q._id });
  if (!existing) {
    if (outcome === 'correct') return null;
    const next = schedule({ ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 }, outcome, now);
    // A brand-new mistake is reviewable straight away ("Review mistakes" after a lesson).
    if (outcome === 'wrong') next.dueAt = now;
    try {
      return await RevisionItem.create({
        userId,
        questionId: q._id,
        lessonId: q.lessonId,
        topic: q.topic,
        ...next,
        wrongCount: outcome === 'wrong' ? 1 : 0,
        skippedCount: outcome === 'skipped' ? 1 : 0,
        lastResult: outcome,
        lastPracticedAt: now,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      return recordRevisionOutcome(userId, q, outcome);
    }
  }
  const next = schedule(
    { ease: existing.ease, intervalDays: existing.intervalDays, reps: existing.reps, lapses: existing.lapses },
    outcome,
    now,
  );
  existing.set({
    ...next,
    lastResult: outcome,
    lastPracticedAt: now,
    wrongCount: existing.wrongCount + (outcome === 'wrong' ? 1 : 0),
    skippedCount: existing.skippedCount + (outcome === 'skipped' ? 1 : 0),
  });
  await existing.save();
  return existing;
}

export interface WeakTopic {
  topic: string;
  accuracy: number;
  attempts: number;
  dueReviews: number;
  repeatedMistakes: number;
  lastPracticedAt: Date | null;
}

/** Weak topics computed purely from persisted answers. */
export async function weakTopics(userId: Types.ObjectId, limit = 5): Promise<WeakTopic[]> {
  const now = Date.now();
  const [stats, items] = await Promise.all([
    TopicStat.find({ userId, attempts: { $gte: 2 } }).lean(),
    RevisionItem.find({ userId, mastered: false }).select('topic dueAt wrongCount').lean(),
  ]);
  // Per-user volumes are small, so this is computed in code (portable across MongoDB-compatible engines).
  const revision: { _id: string; due: number; repeated: number }[] = [];
  const byTopic = new Map<string, { _id: string; due: number; repeated: number }>();
  for (const it of items) {
    let r = byTopic.get(it.topic);
    if (!r) {
      r = { _id: it.topic, due: 0, repeated: 0 };
      byTopic.set(it.topic, r);
      revision.push(r);
    }
    if (new Date(it.dueAt).getTime() <= now) r.due++;
    if (it.wrongCount >= 2) r.repeated++;
  }
  const rev = new Map(revision.map((r) => [r._id, r]));
  return stats
    .map((s) => ({
      topic: s.topic,
      accuracy: s.attempts ? +(s.correct / s.attempts).toFixed(2) : 0,
      attempts: s.attempts,
      dueReviews: rev.get(s.topic)?.due ?? 0,
      repeatedMistakes: rev.get(s.topic)?.repeated ?? 0,
      lastPracticedAt: s.lastPracticedAt ?? null,
    }))
    .filter((t) => t.accuracy < 0.8 || t.repeatedMistakes > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.repeatedMistakes - a.repeatedMistakes)
    .slice(0, limit);
}
