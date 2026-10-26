import { describe, expect, it } from 'vitest';
import { LessonAttempt, RevisionItem, UserProfile, XPTransaction } from '../src/models';
import { api, correctAnswerFor, courseBySlug, playLesson, registerUser, useDb, wrongAnswerFor } from './helpers';

useDb();

async function pathFor(auth: Record<string, string>, slug: string) {
  const course = await courseBySlug(slug);
  const res = await api().get(`/api/v1/courses/${course._id}/units`).set(auth).expect(200);
  const lessons = res.body.data.units.flatMap((u: { lessons: unknown[] }) => u.lessons) as { id: string; status: string; kind: string; title: string }[];
  return { courseId: course._id.toString(), lessons, body: res.body.data };
}

describe('course catalog', () => {
  it('lists published courses from the backend with pagination', async () => {
    const u = await registerUser();
    const res = await api().get('/api/v1/courses?limit=5').set(u.auth).expect(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5, total: 10, totalPages: 2 });
    expect(res.body.data[0]).toHaveProperty('progress.percent', 0);
    const coding = await api().get('/api/v1/courses?track=coding').set(u.auth).expect(200);
    expect(coding.body.data.every((c: { tracks: string[] }) => c.tracks.includes('coding'))).toBe(true);
  });

  it('builds the learning path with only the first lesson available', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'python-foundations');
    expect(lessons[0]!.status).toBe('available');
    expect(lessons.slice(1).every((l) => l.status === 'locked')).toBe(true);
    expect(lessons.some((l) => l.kind === 'checkpoint')).toBe(true);
  });

  it('rejects invalid ids', async () => {
    const u = await registerUser();
    await api().get('/api/v1/courses/not-an-id').set(u.auth).expect(400);
    await api().get('/api/v1/courses/507f1f77bcf86cd799439011').set(u.auth).expect(404);
  });
});

describe('lesson player', () => {
  it('never exposes answer keys before submission', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'python-foundations');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const raw = JSON.stringify(start.body);
    expect(raw).not.toMatch(/"answer"/);
    expect(raw).not.toMatch(/"accepted"/);
    expect(raw).not.toMatch(/"mapping"/);
    expect(start.body.data.questions.length).toBeGreaterThanOrEqual(3);
  });

  it('enforces prerequisites on the server', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'python-foundations');
    const res = await api().post(`/api/v1/lessons/${lessons[1]!.id}/start`).set(u.auth).expect(403);
    expect(res.body.error.code).toBe('LESSON_LOCKED');
  });

  it('checks answers, explains them, and is idempotent per question', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'english-grammar-vocabulary');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const attemptId = start.body.data.attempt.id;
    const q = start.body.data.questions[0];

    const wrong = await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(u.auth)
      .send({ attemptId, questionId: q.id, answer: await wrongAnswerFor(q.id) })
      .expect(200);
    expect(wrong.body.data).toMatchObject({ correct: false, alreadyAnswered: false, hearts: 4 });
    expect(wrong.body.data.explanation.length).toBeGreaterThan(5);
    expect(wrong.body.data.correctAnswer).toBeTruthy();

    // Retrying (even with the right answer) returns the original result and costs nothing.
    const retry = await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(u.auth)
      .send({ attemptId, questionId: q.id, answer: await correctAnswerFor(q.id) })
      .expect(200);
    expect(retry.body.data).toMatchObject({ correct: false, alreadyAnswered: true });
    const profile = await UserProfile.findOne({ userId: u.oid }).lean();
    expect(profile!.gamification!.hearts).toBe(4);

    // Wrong answer is queued for revision.
    expect(await RevisionItem.exists({ userId: u.oid, questionId: q.id })).toBeTruthy();
  });

  it('rejects malformed answers with 400', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'english-grammar-vocabulary');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const q = start.body.data.questions[0]; // multiple choice
    await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(u.auth)
      .send({ attemptId: start.body.data.attempt.id, questionId: q.id, answer: 99 })
      .expect(400);
    await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(u.auth)
      .send({ attemptId: start.body.data.attempt.id, questionId: q.id, answer: { $ne: null } })
      .expect(400);
  });

  it('requires every question to be answered before completion', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'aptitude-reasoning');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const res = await api().post(`/api/v1/lessons/${lessons[0]!.id}/complete`).set(u.auth).send({ attemptId: start.body.data.attempt.id }).expect(409);
    expect(res.body.error.code).toBe('LESSON_INCOMPLETE');
  });

  it('resumes an unfinished attempt instead of losing progress', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'aptitude-reasoning');
    const s1 = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const q = s1.body.data.questions[0];
    await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(u.auth)
      .send({ attemptId: s1.body.data.attempt.id, questionId: q.id, answer: await correctAnswerFor(q.id) })
      .expect(200);
    const s2 = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    expect(s2.body.data.attempt.id).toBe(s1.body.data.attempt.id);
    expect(s2.body.data.attempt.answered).toHaveLength(1);
  });
});

describe('XP, unlocking and idempotency', () => {
  it('completes a lesson, persists XP and unlocks the next lesson', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'python-foundations');
    const { result } = await playLesson(u.auth, lessons[0]!.id);
    expect(result).toMatchObject({ passed: true, perfect: true, firstCompletion: true, alreadyCompleted: false });
    expect(result.xpEarned).toBeGreaterThanOrEqual(20); // 15 lesson + 5 perfect (+ possible challenge)
    expect(result.newlyUnlocked.map((l: { id: string }) => l.id)).toContain(lessons[1]!.id);
    expect(result.achievements.map((a: { code: string }) => a.code)).toContain('first_steps');
    expect(result.streak.current).toBe(1);

    const ledger = await XPTransaction.find({ userId: u.oid }).lean();
    const profile = await UserProfile.findOne({ userId: u.oid }).lean();
    expect(profile!.gamification!.totalXp).toBe(ledger.reduce((s, t) => s + t.amount, 0));
    const after = await pathFor(u.auth, 'python-foundations');
    expect(after.lessons[0]!.status).toBe('completed');
    expect(after.lessons[1]!.status).toBe('available');
  });

  it('awards XP exactly once for duplicate and concurrent completion requests', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'javascript-react');
    const lessonId = lessons[0]!.id;
    const start = await api().post(`/api/v1/lessons/${lessonId}/start`).set(u.auth).expect(200);
    const attemptId = start.body.data.attempt.id;
    for (const q of start.body.data.questions) {
      await api().post(`/api/v1/lessons/${lessonId}/submit`).set(u.auth).send({ attemptId, questionId: q.id, answer: await correctAnswerFor(q.id) }).expect(200);
    }
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => api().post(`/api/v1/lessons/${lessonId}/complete`).set(u.auth).send({ attemptId })),
    );
    for (const r of responses) expect(r.status).toBe(200);
    const fresh = responses.filter((r) => r.body.data.alreadyCompleted === false);
    expect(fresh).toHaveLength(1);
    // Every response reports the same XP; the ledger contains exactly one first-completion entry.
    expect(new Set(responses.map((r) => r.body.data.xpEarned)).size).toBe(1);
    const firsts = await XPTransaction.countDocuments({ userId: u.oid, reason: 'lesson_first_completion' });
    expect(firsts).toBe(1);
    const again = await api().post(`/api/v1/lessons/${lessonId}/complete`).set(u.auth).send({ attemptId }).expect(200);
    expect(again.body.data.alreadyCompleted).toBe(true);
    expect(await XPTransaction.countDocuments({ userId: u.oid, reason: 'lesson_first_completion' })).toBe(1);
  });

  it('gives only small practice XP when replaying a completed lesson', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'dsa-essentials');
    await playLesson(u.auth, lessons[0]!.id);
    const { result } = await playLesson(u.auth, lessons[0]!.id);
    expect(result.firstCompletion).toBe(false);
    expect(result.xpBreakdown.filter((x: { reason: string }) => x.reason !== 'Daily challenge')).toEqual([{ reason: 'Practice', amount: 3 }]);
  });

  it('requires 70% on checkpoints to unlock the next unit', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'aptitude-reasoning');
    for (const l of lessons.filter((x) => x.kind !== 'checkpoint')) await playLesson(u.auth, l.id);
    const checkpoint = lessons.find((l) => l.kind === 'checkpoint')!;
    const fail = await playLesson(u.auth, checkpoint.id, [0, 1, 2]);
    expect(fail.result).toMatchObject({ passed: false, firstCompletion: false, xpEarned: expect.any(Number) });
    expect(fail.result.xpBreakdown.find((x: { reason: string }) => x.reason === 'Lesson complete')).toBeUndefined();
    const pass = await playLesson(u.auth, checkpoint.id);
    expect(pass.result.passed).toBe(true);
    expect(pass.result.unitCompleted).toMatchObject({ rewardXp: 20 });
  });

  it('prevents users from touching another user\'s attempts', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const { lessons } = await pathFor(a.auth, 'english-grammar-vocabulary');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(a.auth).expect(200);
    const q = start.body.data.questions[0];
    await api()
      .post(`/api/v1/lessons/${lessons[0]!.id}/submit`)
      .set(b.auth)
      .send({ attemptId: start.body.data.attempt.id, questionId: q.id, answer: 0 })
      .expect(404);
    await api().post(`/api/v1/lessons/${lessons[0]!.id}/complete`).set(b.auth).send({ attemptId: start.body.data.attempt.id }).expect(404);
    const attempt = await LessonAttempt.findById(start.body.data.attempt.id).lean();
    expect(attempt!.answers).toHaveLength(0);
  });

  it('blocks answers when hearts run out without losing progress', async () => {
    const u = await registerUser();
    await UserProfile.updateOne({ userId: u.oid }, { $set: { 'gamification.hearts': 1, 'gamification.heartsUpdatedAt': new Date() } });
    const { lessons } = await pathFor(u.auth, 'english-grammar-vocabulary');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    const [q1, q2] = start.body.data.questions;
    const attemptId = start.body.data.attempt.id;
    const r1 = await api().post(`/api/v1/lessons/${lessons[0]!.id}/submit`).set(u.auth).send({ attemptId, questionId: q1.id, answer: await wrongAnswerFor(q1.id) }).expect(200);
    expect(r1.body.data.hearts).toBe(0);
    const r2 = await api().post(`/api/v1/lessons/${lessons[0]!.id}/submit`).set(u.auth).send({ attemptId, questionId: q2.id, answer: await correctAnswerFor(q2.id) }).expect(403);
    expect(r2.body.error.code).toBe('OUT_OF_HEARTS');
    // Progress is kept and revision is available to earn hearts back.
    const resume = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(u.auth).expect(200);
    expect(resume.body.data.attempt.answered).toHaveLength(1);
    const due = await api().get('/api/v1/revision/due').set(u.auth).expect(200);
    expect(due.body.data.items.map((i: { question: { id: string } }) => i.question.id)).toContain(q1.id);
    const rev = await api().post('/api/v1/revision/submit').set(u.auth).send({ questionId: q1.id, answer: await correctAnswerFor(q1.id) }).expect(200);
    expect(rev.body.data).toMatchObject({ correct: true, hearts: 1 });
  });
});

describe('progress & revision', () => {
  it('survives logout and login', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'professional-skills');
    await playLesson(u.auth, lessons[0]!.id, [0]);
    await api().post('/api/v1/auth/logout').send({ refreshToken: u.refreshToken }).expect(200);
    const login = await api().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.data.tokens.accessToken}` };
    const progress = await api().get('/api/v1/progress/me').set(auth).expect(200);
    expect(progress.body.data.gamification.totalXp).toBeGreaterThan(0);
    expect(progress.body.data.gamification.stats.lessonsCompleted).toBe(1);
    expect(progress.body.data.courses[0]).toMatchObject({ completedLessons: 1 });
    expect(progress.body.data.topicAccuracy.length).toBeGreaterThan(0);
    const after = await pathFor(auth, 'professional-skills');
    expect(after.lessons[0]!.status).toBe('completed');
  });

  it('schedules wrong answers for revision and reschedules after a correct review', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'ai-generative-ai');
    const { questions } = await playLesson(u.auth, lessons[0]!.id, [0, 1]);
    const due = await api().get('/api/v1/revision/due').set(u.auth).expect(200);
    expect(due.body.data.dueCount).toBe(2);
    expect(JSON.stringify(due.body)).not.toMatch(/"accepted"|"mapping"|"index"/);
    const qid = questions[0]!.id;
    const res = await api().post('/api/v1/revision/submit').set(u.auth).send({ questionId: qid, answer: await correctAnswerFor(qid) }).expect(200);
    expect(new Date(res.body.data.nextDueAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    const due2 = await api().get('/api/v1/revision/due').set(u.auth).expect(200);
    expect(due2.body.data.dueCount).toBe(1);
  });

  it("refuses revision on questions from lessons the user hasn't opened", async () => {
    const u = await registerUser();
    const other = await registerUser();
    const { lessons } = await pathFor(other.auth, 'dsa-essentials');
    const start = await api().post(`/api/v1/lessons/${lessons[0]!.id}/start`).set(other.auth).expect(200);
    await api().post('/api/v1/revision/submit').set(u.auth).send({ questionId: start.body.data.questions[0].id, answer: 0 }).expect(404);
  });

  it('computes weak topics from real answers', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'workplace-communication');
    await playLesson(u.auth, lessons[0]!.id, [0, 1, 2]);
    const weak = await api().get('/api/v1/progress/me/weak-topics').set(u.auth).expect(200);
    expect(weak.body.data.source).toBe('performance_data');
    expect(weak.body.data.topics[0]).toMatchObject({ topic: 'Self-introduction' });
    expect(weak.body.data.topics[0].accuracy).toBeLessThan(0.5);
  });

  it('reports weekly activity and gamification summary', async () => {
    const u = await registerUser();
    const { lessons } = await pathFor(u.auth, 'interview-preparation');
    await playLesson(u.auth, lessons[0]!.id);
    const weekly = await api().get('/api/v1/progress/me/weekly').set(u.auth).expect(200);
    expect(weekly.body.data.days).toHaveLength(7);
    expect(weekly.body.data.totalXp).toBeGreaterThan(0);
    const g = await api().get('/api/v1/gamification/me').set(u.auth).expect(200);
    expect(g.body.data).toMatchObject({ level: 1, streak: { current: 1, activeToday: true }, hearts: { max: 5 } });
    expect(g.body.data.recentAchievements.length).toBeGreaterThan(0);
    const challenge = await api().get('/api/v1/challenges/daily').set(u.auth).expect(200);
    expect(challenge.body.data).toHaveProperty('target');
  });
});
