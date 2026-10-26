import { describe, expect, it } from 'vitest';
import { RefreshToken, User } from '../src/models';
import { api, registerUser, useDb } from './helpers';

useDb();

describe('registration & login', () => {
  it('registers, hashes the password and returns a token pair', async () => {
    const u = await registerUser();
    const stored = await User.findById(u.userId).select('+passwordHash').lean();
    expect(stored!.passwordHash).not.toContain(u.password);
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    const me = await api().get('/api/v1/auth/me').set(u.auth).expect(200);
    expect(me.body.data.user.email).toBe(u.email);
    expect(me.body.data.profile.onboardingComplete).toBe(true);
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    const u = await registerUser();
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: u.email.toUpperCase(), password: 'Another1pass', displayName: 'Dup' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input and reports field errors', async () => {
    const res = await api().post('/api/v1/auth/register').send({ email: 'nope', password: 'short', displayName: 'x' }).expect(400);
    expect(res.body.success).toBe(false);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });

  it('rejects unknown fields (mass-assignment) such as role', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ email: 'sneaky@test.dev', password: 'Passw0rd!', displayName: 'Sneaky', role: 'admin' })
      .expect(400);
  });

  it('logs in with correct credentials and rejects wrong ones uniformly', async () => {
    const u = await registerUser();
    await api().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(200);
    const wrong = await api().post('/api/v1/auth/login').send({ email: u.email, password: 'Wrong1234' }).expect(401);
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'ghost@test.dev', password: 'Wrong1234' }).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks NoSQL operator injection in login', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } }).expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects requests without or with invalid tokens', async () => {
    await api().get('/api/v1/auth/me').expect(401);
    await api().get('/api/v1/auth/me').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens and detects reuse of an old refresh token', async () => {
    const u = await registerUser();
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(200);
    const newRefresh = r1.body.data.tokens.refreshToken;
    expect(newRefresh).not.toBe(u.refreshToken);

    // Reusing the rotated token is treated as theft: the whole family is revoked.
    const reuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    await api().post('/api/v1/auth/refresh').send({ refreshToken: newRefresh }).expect(401);
  });

  it('stores only hashes of refresh tokens', async () => {
    const u = await registerUser();
    const tokens = await RefreshToken.find({ userId: u.oid }).lean();
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(t.tokenHash).not.toBe(u.refreshToken);
  });

  it('logout revokes the session', async () => {
    const u = await registerUser();
    await api().post('/api/v1/auth/logout').send({ refreshToken: u.refreshToken }).expect(200);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
  });
});

describe('password reset', () => {
  it('does not reveal whether an email exists', async () => {
    const res = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.dev' }).expect(202);
    expect(res.body.data.devResetToken).toBeUndefined();
  });

  it('resets the password once and signs out other sessions', async () => {
    const u = await registerUser();
    const f = await api().post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(202);
    const token = f.body.data.devResetToken;
    expect(token).toBeTruthy();
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'NewPassw0rd' }).expect(200);
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'OtherPass1' }).expect(400);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    await api().post('/api/v1/auth/login').send({ email: u.email, password: 'NewPassw0rd' }).expect(200);
  });
});

describe('platform', () => {
  it('health check reports database status', async () => {
    const res = await api().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'connected' });
  });

  it('serves OpenAPI documentation', async () => {
    const res = await api().get('/api/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toContain('/lessons/{lessonId}/complete');
  });

  it('returns consistent JSON errors with request ids and security headers', async () => {
    const res = await api().get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized and malformed bodies', async () => {
    await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
    const big = await api().post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(100_000) }).expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
