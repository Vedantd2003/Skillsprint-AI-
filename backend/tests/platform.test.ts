import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeLimiter } from '../src/middleware/rateLimit';
import { LessonAttempt, User, UserProfile, XPTransaction } from '../src/models';
import { api, courseBySlug, playLesson, registerUser, useDb } from './helpers';

useDb();

describe('rate limiting', () => {
  it('returns 429 with the standard error envelope after the limit', async () => {
    const app = express();
    app.use(makeLimiter(3));
    app.get('/x', (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 3; i++) await request(app).get('/x').expect(200);
    const res = await request(app).get('/x').expect(429);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
    expect(res.headers['ratelimit-policy'] ?? res.headers['ratelimit']).toBeTruthy();
  });
});

describe('profile & settings', () => {
  it('updates learning, display and notification preferences with validation', async () => {
    const u = await registerUser();
    const res = await api()
      .patch('/api/v1/profile/me')
      .set(u.auth)
      .send({ displayName: 'Vedant D', dailyXpGoal: 50, tutorLanguage: 'mr', preferences: { theme: 'dark', sound: false }, notifications: { reminderHour: 8 } })
      .expect(200);
    expect(res.body.data).toMatchObject({ displayName: 'Vedant D', dailyXpGoal: 50, tutorLanguage: 'mr', preferences: { theme: 'dark', sound: false }, notifications: { reminderHour: 8 } });
    await api().patch('/api/v1/profile/me').set(u.auth).send({ timezone: 'Mars/Olympus' }).expect(400);
    await api().patch('/api/v1/profile/me').set(u.auth).send({ dailyXpGoal: 5000 }).expect(400);
    await api().patch('/api/v1/profile/me').set(u.auth).send({ 'gamification.totalXp': 99999 }).expect(400);
  });

  it('deletes the account and all related data after password confirmation', async () => {
    const u = await registerUser();
    const course = await courseBySlug('aptitude-reasoning');
    const path = await api().get(`/api/v1/courses/${course._id}/units`).set(u.auth).expect(200);
    await playLesson(u.auth, path.body.data.units[0].lessons[0].id);
    await api().delete('/api/v1/profile/me').set(u.auth).send({ password: 'wrong' }).expect(401);
    await api().delete('/api/v1/profile/me').set(u.auth).send({ password: u.password }).expect(200);
    expect(await User.exists({ _id: u.oid })).toBeNull();
    expect(await UserProfile.exists({ userId: u.oid })).toBeNull();
    expect(await XPTransaction.countDocuments({ userId: u.oid })).toBe(0);
    expect(await LessonAttempt.countDocuments({ userId: u.oid })).toBe(0);
    await api().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(401);
  });
});

describe('leaderboard, achievements & friends', () => {
  it('ranks by XP and never exposes emails', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const course = await courseBySlug('dsa-essentials');
    const path = await api().get(`/api/v1/courses/${course._id}/units`).set(a.auth).expect(200);
    await playLesson(a.auth, path.body.data.units[0].lessons[0].id);
    const res = await api().get('/api/v1/leaderboard?scope=weekly').set(b.auth).expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('@test.dev');
    expect(raw).not.toMatch(/userId|email/);
    expect(res.body.data.entries[0]).toHaveProperty('rank', 1);
    expect(res.body.data.entries.some((e: { displayName: string }) => e.displayName.startsWith('Learner'))).toBe(true);
  });

  it('respects the leaderboard opt-out', async () => {
    const a = await registerUser();
    await api().patch('/api/v1/profile/me').set(a.auth).send({ showOnLeaderboard: false, displayName: 'Hidden Person' }).expect(200);
    const course = await courseBySlug('dsa-essentials');
    const path = await api().get(`/api/v1/courses/${course._id}/units`).set(a.auth).expect(200);
    await playLesson(a.auth, path.body.data.units[0].lessons[0].id);
    const res = await api().get('/api/v1/leaderboard?scope=alltime&limit=100').set(a.auth).expect(200);
    expect(JSON.stringify(res.body.data.entries)).not.toContain('Hidden Person');
  });

  it('connects friends by code and shows a friends leaderboard', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const bProfile = await api().get('/api/v1/profile/me').set(b.auth).expect(200);
    await api().post('/api/v1/friends').set(a.auth).send({ friendCode: bProfile.body.data.friendCode }).expect(201);
    const friends = await api().get('/api/v1/friends').set(a.auth).expect(200);
    expect(friends.body.data).toHaveLength(1);
    expect(JSON.stringify(friends.body)).not.toContain('@');
    const ownCode = (await api().get('/api/v1/profile/me').set(a.auth)).body.data.friendCode;
    await api().post('/api/v1/friends').set(a.auth).send({ friendCode: ownCode }).expect(400);
    await api().get('/api/v1/leaderboard?scope=friends').set(a.auth).expect(200);
  });

  it('lists achievements with progress', async () => {
    const u = await registerUser();
    const res = await api().get('/api/v1/achievements').set(u.auth).expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
    expect(res.body.data[0]).toMatchObject({ unlocked: false, progress: 0 });
  });
});

describe('admin content management', () => {
  it('is forbidden for learners', async () => {
    const u = await registerUser();
    await api().get('/api/v1/admin/metrics').set(u.auth).expect(403);
    await api().post('/api/v1/admin/courses').set(u.auth).send({}).expect(403);
  });

  it('lets admins create content with validated answer keys and publish it', async () => {
    const u = await registerUser();
    await User.updateOne({ _id: u.oid }, { $set: { role: 'admin' } });
    const login = await api().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.data.tokens.accessToken}` };
    const c = await api()
      .post('/api/v1/admin/courses')
      .set(auth)
      .send({ slug: `test-course-${Date.now()}`, title: 'Test Course', category: 'professional', description: 'A course created in tests.' })
      .expect(201);
    const unit = await api().post('/api/v1/admin/units').set(auth).send({ courseId: c.body.data._id, key: `unit-${Date.now()}`, order: 0, title: 'Unit' }).expect(201);
    const lesson = await api()
      .post('/api/v1/admin/lessons')
      .set(auth)
      .send({ unitId: unit.body.data._id, key: `lesson-${Date.now()}`, order: 0, title: 'Lesson', topic: 'Testing', published: true })
      .expect(201);
    await api()
      .post('/api/v1/admin/questions')
      .set(auth)
      .send({ lessonId: lesson.body.data._id, key: `q-${Date.now()}`, order: 0, type: 'multiple_choice', prompt: 'Pick one', data: { options: ['a', 'b'] }, answer: { index: 5 }, explanation: 'Because.', topic: 'Testing' })
      .expect(400);
    await api()
      .post('/api/v1/admin/questions')
      .set(auth)
      .send({ lessonId: lesson.body.data._id, key: `q-${Date.now()}`, order: 0, type: 'multiple_choice', prompt: 'Pick one', data: { options: ['a', 'b'] }, answer: { index: 1 }, explanation: 'Because.', topic: 'Testing' })
      .expect(201);
    // Unpublished course is hidden from learners until published.
    await api().get(`/api/v1/courses/${c.body.data._id}`).set(auth).expect(404);
    await api().post(`/api/v1/admin/courses/${c.body.data._id}/publish`).set(auth).send({ published: true }).expect(200);
    await api().get(`/api/v1/courses/${c.body.data._id}`).set(auth).expect(200);
    const metrics = await api().get('/api/v1/admin/metrics').set(auth).expect(200);
    expect(metrics.body.data.users).toBeGreaterThan(0);
    // Clean up so catalog counts in other tests stay stable.
    await api().post(`/api/v1/admin/courses/${c.body.data._id}/publish`).set(auth).send({ published: false }).expect(200);
  });
});
