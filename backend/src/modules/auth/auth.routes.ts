import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler, ok } from '../../lib/http';
import { notFound } from '../../lib/errors';
import { authed, requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { body } from '../../middleware/validate';
import { User, UserProfile } from '../../models';
import * as auth from './auth.service';

export const Password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const Email = z.string().trim().toLowerCase().email().max(254);

export const OnboardingSchema = z
  .object({
    uiLanguage: z.enum(['en', 'hi', 'mr']).optional(),
    tutorLanguage: z.string().min(2).max(10).optional(),
    learningGoal: z.string().min(2).max(40).optional(),
    interests: z.array(z.string().min(2).max(40)).max(10).optional(),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    dailyXpGoal: z.number().int().min(10).max(200).optional(),
    timezone: z.string().min(2).max(64).optional(),
  })
  .strict();

const RegisterBody = z
  .object({
    email: Email,
    password: Password,
    displayName: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[\p{L}\p{N} _.-]+$/u, 'Display name can use letters, numbers, spaces, _ . -'),
    onboarding: OnboardingSchema.optional(),
  })
  .strict();

const LoginBody = z.object({ email: Email, password: z.string().min(1).max(128) }).strict();
const RefreshBody = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = body(req, RegisterBody);
    const result = await auth.register(input, req.get('user-agent'));
    ok(res, result, 201);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = body(req, LoginBody);
    ok(res, await auth.login(email, password, req.get('user-agent')));
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = body(req, RefreshBody);
    ok(res, { tokens: await auth.refresh(refreshToken, req.get('user-agent')) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = body(req, RefreshBody);
    await auth.logout(refreshToken);
    ok(res, { loggedOut: true });
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = body(req, z.object({ email: Email }).strict());
    const token = await auth.forgotPassword(email);
    // Same response whether or not the account exists (no user enumeration).
    ok(
      res,
      {
        message: 'If an account exists for that email, a reset code has been sent.',
        ...(env.EXPOSE_DEV_RESET_TOKEN && token ? { devResetToken: token } : {}),
      },
      202,
    );
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = body(req, z.object({ token: z.string().min(20).max(200), password: Password }).strict());
    await auth.resetPassword(token, password);
    ok(res, { reset: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const [user, profile] = await Promise.all([User.findById(u.oid), UserProfile.findOne({ userId: u.oid })]);
    if (!user || !profile) throw notFound('Account');
    ok(res, {
      user: { id: user._id.toString(), email: user.email, role: user.role },
      profile: {
        displayName: profile.displayName,
        onboardingComplete: profile.onboardingComplete,
        uiLanguage: profile.uiLanguage,
      },
    });
  }),
);
