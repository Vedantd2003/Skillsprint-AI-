import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimit';
import { body, idParam, objectId, params, query } from '../../middleware/validate';
import * as ai from './ai.service';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const Language = z.string().regex(/^[a-z]{2}$/).optional();

aiRouter.get('/status', (_req, res) => {
  ok(res, ai.aiStatus());
});

aiRouter.post(
  '/tutor/chat',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z
        .object({
          conversationId: objectId.optional(),
          message: z.string().trim().min(1).max(2000),
          language: Language,
          mode: z.enum(['tutor', 'roleplay', 'grammar']).optional(),
          lessonId: objectId.optional(),
          scenario: z.string().trim().min(3).max(200).optional(),
        })
        .strict(),
    );
    ok(res, await ai.tutorChat(u.oid, b, req.requestId));
  }),
);

aiRouter.post(
  '/quizzes/generate',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z
        .object({
          topic: z.string().trim().min(2).max(200),
          difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
          count: z.number().int().min(3).max(10).default(5),
          language: Language,
          lessonId: objectId.optional(),
        })
        .strict(),
    );
    ok(res, await ai.generateQuiz(u.oid, b, req.requestId), 201);
  }),
);

aiRouter.get(
  '/quizzes/:quizId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { quizId } = params(req, idParam('quizId'));
    ok(res, await ai.getQuiz(u.oid, quizId));
  }),
);

aiRouter.post(
  '/quizzes/:quizId/submit',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { quizId } = params(req, idParam('quizId'));
    const b = body(
      req,
      z
        .object({
          answers: z.array(z.object({ questionId: z.string().uuid(), answer: z.number().int().min(0).max(5) }).strict()).max(10),
        })
        .strict(),
    );
    ok(res, await ai.submitQuiz(u.oid, quizId, b.answers));
  }),
);

aiRouter.post(
  '/explanations',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z.object({ questionId: objectId, givenAnswer: z.string().trim().min(1).max(500), language: Language }).strict(),
    );
    ok(res, await ai.explainMistake(u.oid, b, req.requestId));
  }),
);

aiRouter.post(
  '/study-plan',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z.object({ days: z.number().int().min(1).max(14).default(7), focus: z.string().trim().max(200).optional(), language: Language }).strict(),
    );
    ok(res, await ai.studyPlan(u.oid, b, req.requestId));
  }),
);

aiRouter.post(
  '/interview/practice',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const b = body(
      req,
      z
        .object({
          mode: z.enum(['hr', 'technical']),
          role: z.string().trim().min(2).max(100),
          question: z.string().trim().max(500).optional(),
          answer: z.string().trim().min(10).max(4000).optional(),
          previousQuestions: z.array(z.string().max(500)).max(10).optional(),
          language: Language,
        })
        .strict()
        .refine((v) => !v.answer || v.question, { message: 'question is required when submitting an answer' }),
    );
    ok(res, await ai.interviewPractice(u.oid, b, req.requestId));
  }),
);

aiRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const q = query(req, PaginationQuery);
    const { items, total } = await ai.listConversations(u.oid, q.page, q.limit);
    ok(res, items, 200, pageMeta(q.page, q.limit, total));
  }),
);

aiRouter.get(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { conversationId } = params(req, idParam('conversationId'));
    const q = query(req, PaginationQuery.extend({ limit: z.coerce.number().int().min(1).max(100).default(50) }));
    const { total, ...data } = await ai.getConversation(u.oid, conversationId, q.page, q.limit);
    ok(res, data, 200, pageMeta(q.page, q.limit, total));
  }),
);

aiRouter.delete(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { conversationId } = params(req, idParam('conversationId'));
    await ai.deleteConversation(u.oid, conversationId);
    ok(res, { deleted: true });
  }),
);
