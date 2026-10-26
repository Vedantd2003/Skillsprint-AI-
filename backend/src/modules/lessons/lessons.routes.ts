import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { body, idParam, objectId, params } from '../../middleware/validate';
import * as svc from './lesson.service';

export const lessonsRouter = Router();
lessonsRouter.use(requireAuth);

/**
 * Answers are typed loosely here (they differ per question type) but bounded in
 * size, and each type is strictly validated by the answer checker.
 */
const AnswerValue = z.union([
  z.number().int().min(0).max(100),
  z.boolean(),
  z.string().max(1000),
  z.array(z.union([z.string().max(100), z.number().int().min(0).max(100)])).max(30),
  z.object({ knew: z.boolean() }).strict(),
]);

const SubmitBody = z
  .object({
    attemptId: objectId,
    questionId: objectId,
    answer: AnswerValue.optional(),
    skip: z.boolean().optional(),
    clientEventId: z.string().max(64).optional(),
  })
  .strict()
  .refine((b) => b.skip || b.answer !== undefined, { message: 'Provide an answer or skip: true' });

lessonsRouter.get(
  '/:lessonId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { lessonId } = params(req, idParam('lessonId'));
    ok(res, await svc.getLessonDetail(u.oid, lessonId));
  }),
);

lessonsRouter.post(
  '/:lessonId/start',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { lessonId } = params(req, idParam('lessonId'));
    ok(res, await svc.startLesson(u.oid, lessonId));
  }),
);

lessonsRouter.post(
  '/:lessonId/submit',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { lessonId } = params(req, idParam('lessonId'));
    const b = body(req, SubmitBody);
    ok(res, await svc.submitAnswer(u.oid, lessonId, b));
  }),
);

lessonsRouter.post(
  '/:lessonId/complete',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { lessonId } = params(req, idParam('lessonId'));
    const { attemptId } = body(req, z.object({ attemptId: objectId }).strict());
    ok(res, await svc.completeLesson(u.oid, lessonId, attemptId));
  }),
);
