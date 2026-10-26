import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import { createApp } from '../src/app';
import { connectDb } from '../src/db';
import { Course, Lesson, Question } from '../src/models';
import { setProvider } from '../src/modules/ai/ai.service';
import { MockProvider } from '../src/modules/ai/mock.provider';

export const app = createApp();
export const api = () => request(app);

export function useDb() {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) await connectDb(process.env.MONGODB_URI);
  });
  afterAll(async () => {
    setProvider(null);
    await mongoose.disconnect();
  });
}

let counter = 0;
export async function registerUser(overrides: Record<string, unknown> = {}) {
  counter++;
  const email = `learner${Date.now()}${counter}${Math.floor(Math.random() * 1e6)}@test.dev`;
  const password = 'Passw0rd!';
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ email, password, displayName: `Learner ${counter}`, onboarding: { timezone: 'Asia/Kolkata', dailyXpGoal: 20 }, ...overrides })
    .expect(201);
  const { accessToken, refreshToken } = res.body.data.tokens;
  return {
    email,
    password,
    userId: res.body.data.user.id as string,
    oid: new Types.ObjectId(res.body.data.user.id),
    accessToken: accessToken as string,
    refreshToken: refreshToken as string,
    auth: { Authorization: `Bearer ${accessToken}` },
  };
}

export async function courseBySlug(slug: string) {
  const c = await Course.findOne({ slug }).lean();
  if (!c) throw new Error(`course ${slug} not seeded`);
  return c;
}

export async function lessonsOf(slug: string) {
  const c = await courseBySlug(slug);
  return Lesson.find({ courseId: c._id }).sort({ unitId: 1, order: 1 }).lean();
}

/** Builds the correct answer for a question from its server-side key (test-only helper). */
export async function correctAnswerFor(questionId: string): Promise<unknown> {
  const q = await Question.findById(questionId).select('+answer').lean();
  if (!q) throw new Error('question not found');
  const key = q.answer as Record<string, unknown>;
  switch (q.type) {
    case 'multiple_choice':
      return key.index;
    case 'true_false':
      return key.value;
    case 'word_order':
      return key.order;
    case 'match_pairs':
      return key.mapping;
    case 'flashcard':
      return { knew: true };
    case 'short_answer':
      return (key.accepted as string[] | undefined)?.[0] ?? (key.keywords as string[]).join(' ');
    default:
      return (key.accepted as string[])[0];
  }
}

export async function wrongAnswerFor(questionId: string): Promise<unknown> {
  const q = await Question.findById(questionId).select('+answer').lean();
  if (!q) throw new Error('question not found');
  const key = q.answer as Record<string, unknown>;
  const data = q.data as Record<string, unknown>;
  switch (q.type) {
    case 'multiple_choice':
      return ((key.index as number) + 1) % (data.options as string[]).length;
    case 'true_false':
      return !key.value;
    case 'word_order':
      return [...(key.order as string[])].reverse();
    case 'match_pairs':
      return (key.mapping as number[]).map((_, i, arr) => arr[(i + 1) % arr.length]);
    case 'flashcard':
      return { knew: false };
    default:
      return 'definitely-wrong-answer';
  }
}

/** Plays a whole lesson; `wrongIndexes` lists question positions to answer incorrectly. */
export async function playLesson(auth: Record<string, string>, lessonId: string, wrongIndexes: number[] = []) {
  const start = await api().post(`/api/v1/lessons/${lessonId}/start`).set(auth).expect(200);
  const attemptId = start.body.data.attempt.id as string;
  const answered = new Set((start.body.data.attempt.answered as { questionId: string }[]).map((a) => a.questionId));
  const questions = start.body.data.questions as { id: string }[];
  for (const [i, q] of questions.entries()) {
    if (answered.has(q.id)) continue;
    const answer = wrongIndexes.includes(i) ? await wrongAnswerFor(q.id) : await correctAnswerFor(q.id);
    await api().post(`/api/v1/lessons/${lessonId}/submit`).set(auth).send({ attemptId, questionId: q.id, answer }).expect(200);
  }
  const done = await api().post(`/api/v1/lessons/${lessonId}/complete`).set(auth).send({ attemptId }).expect(200);
  return { attemptId, result: done.body.data, questions };
}

export function useMockAI() {
  const mock = new MockProvider();
  beforeAll(() => setProvider(mock));
  return mock;
}
