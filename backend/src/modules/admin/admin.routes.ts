import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import { asyncHandler, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { addDays, dayKey } from '../../lib/dates';
import { env } from '../../config/env';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { body, idParam, objectId, params, query } from '../../middleware/validate';
import { AIQuiz, AIUsage, Course, Lesson, LessonAttempt, Question, Unit, User } from '../../models';
import { COURSE_CATEGORIES, QUESTION_TYPES } from '../../models/content';
import { validateAnswerKey } from '../lessons/answerChecker';

/**
 * Protected content-management API. Only role=admin can reach these routes.
 * Promote a user with `npm run make-admin -- <email>`.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const CourseBody = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().trim().min(3).max(120),
    category: z.enum(COURSE_CATEGORIES),
    description: z.string().trim().min(10).max(1000),
    level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    estimatedHours: z.number().min(0).max(500).default(1),
    objectives: z.array(z.string().trim().min(3).max(200)).max(12).default([]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6C4CF1'),
    icon: z.string().max(40).default('book'),
    tracks: z.array(z.enum(['english', 'coding', 'interview', 'ai', 'aptitude', 'professional'])).default([]),
    order: z.number().int().min(0).default(0),
    published: z.boolean().default(false),
  })
  .strict();

const UnitBody = z
  .object({
    courseId: objectId,
    key: z.string().trim().regex(/^[a-z0-9:_-]{3,120}$/),
    order: z.number().int().min(0),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).default(''),
    rewardXp: z.number().int().min(0).max(500).default(20),
    published: z.boolean().default(true),
  })
  .strict();

const LessonBody = z
  .object({
    unitId: objectId,
    key: z.string().trim().regex(/^[a-z0-9:_-]{3,160}$/),
    order: z.number().int().min(0),
    title: z.string().trim().min(2).max(120),
    summary: z.string().trim().max(500).default(''),
    kind: z.enum(['lesson', 'checkpoint', 'review']).default('lesson'),
    topic: z.string().trim().min(2).max(80),
    xpReward: z.number().int().min(0).max(200).default(env.XP_LESSON_DEFAULT),
    prerequisites: z.array(objectId).max(10).default([]),
    published: z.boolean().default(false),
  })
  .strict();

const QuestionBody = z
  .object({
    lessonId: objectId,
    key: z.string().trim().regex(/^[a-z0-9:_-]{3,200}$/),
    order: z.number().int().min(0),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(3).max(2000),
    instructions: z.string().trim().max(300).default(''),
    data: z.record(z.unknown()).default({}),
    answer: z.record(z.unknown()),
    explanation: z.string().trim().min(3).max(1500),
    topic: z.string().trim().min(2).max(80),
    difficulty: z.number().int().min(1).max(5).default(1),
  })
  .strict();

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

// ----- Courses -----
adminRouter.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const q = query(req, PaginationQuery);
    const [items, total] = await Promise.all([
      Course.find().sort({ order: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      Course.countDocuments(),
    ]);
    ok(res, items, 200, pageMeta(q.page, q.limit, total));
  }),
);
adminRouter.post(
  '/courses',
  asyncHandler(async (req, res) => ok(res, await Course.create(body(req, CourseBody)), 201)),
);
adminRouter.patch(
  '/courses/:id',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const doc = await Course.findByIdAndUpdate(id, { $set: body(req, CourseBody.partial()) }, { new: true, runValidators: true });
    if (!doc) throw notFound('Course');
    ok(res, doc);
  }),
);

// ----- Units -----
adminRouter.get(
  '/courses/:id/units',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    ok(res, await Unit.find({ courseId: id }).sort({ order: 1 }).lean());
  }),
);
adminRouter.post(
  '/units',
  asyncHandler(async (req, res) => {
    const b = body(req, UnitBody);
    if (!(await Course.exists({ _id: b.courseId }))) throw notFound('Course');
    ok(res, await Unit.create(b), 201);
  }),
);
adminRouter.patch(
  '/units/:id',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const doc = await Unit.findByIdAndUpdate(id, { $set: body(req, UnitBody.omit({ courseId: true }).partial()) }, { new: true, runValidators: true });
    if (!doc) throw notFound('Unit');
    ok(res, doc);
  }),
);

// ----- Lessons -----
adminRouter.get(
  '/units/:id/lessons',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    ok(res, await Lesson.find({ unitId: id }).sort({ order: 1 }).lean());
  }),
);
adminRouter.post(
  '/lessons',
  asyncHandler(async (req, res) => {
    const b = body(req, LessonBody);
    const unit = await Unit.findById(b.unitId).lean();
    if (!unit) throw notFound('Unit');
    await assertPrerequisites(unit.courseId, b.prerequisites);
    ok(res, await Lesson.create({ ...b, courseId: unit.courseId }), 201);
  }),
);
adminRouter.patch(
  '/lessons/:id',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const b = body(req, LessonBody.omit({ unitId: true }).partial());
    const lesson = await Lesson.findById(id);
    if (!lesson) throw notFound('Lesson');
    if (b.prerequisites) {
      if (b.prerequisites.some((p) => p.equals(lesson._id))) throw badRequest('A lesson cannot require itself');
      await assertPrerequisites(lesson.courseId, b.prerequisites);
    }
    lesson.set(b);
    await lesson.save();
    ok(res, lesson);
  }),
);

async function assertPrerequisites(courseId: import('mongoose').Types.ObjectId, ids: import('mongoose').Types.ObjectId[]) {
  if (!ids.length) return;
  const count = await Lesson.countDocuments({ _id: { $in: ids }, courseId });
  if (count !== ids.length) throw badRequest('Prerequisites must be lessons in the same course');
}

// ----- Question bank -----
adminRouter.get(
  '/lessons/:id/questions',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    ok(res, await Question.find({ lessonId: id }).select('+answer').sort({ order: 1 }).lean());
  }),
);
adminRouter.post(
  '/questions',
  asyncHandler(async (req, res) => {
    const b = body(req, QuestionBody);
    if (!(await Lesson.exists({ _id: b.lessonId }))) throw notFound('Lesson');
    const err = validateAnswerKey(b.type, json(b.answer), json(b.data));
    if (err) throw badRequest(`Invalid answer key: ${err}`);
    ok(res, await Question.create(b), 201);
  }),
);
adminRouter.patch(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const b = body(req, QuestionBody.omit({ lessonId: true }).partial());
    const q = await Question.findById(id).select('+answer');
    if (!q) throw notFound('Question');
    q.set(b);
    const err = validateAnswerKey(q.type, json(q.answer), json(q.data));
    if (err) throw badRequest(`Invalid answer key: ${err}`);
    await q.save();
    ok(res, q);
  }),
);
adminRouter.delete(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const r = await Question.deleteOne({ _id: id });
    if (!r.deletedCount) throw notFound('Question');
    ok(res, { deleted: true });
  }),
);

// ----- Publishing -----
adminRouter.post(
  '/:kind(courses|units|lessons)/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = params(req, z.object({ id: objectId, kind: z.enum(['courses', 'units', 'lessons']) }));
    const { published } = body(req, z.object({ published: z.boolean() }).strict());
    const Model = { courses: Course, units: Unit, lessons: Lesson }[req.params.kind as 'courses' | 'units' | 'lessons'] as typeof Course;
    const doc = await Model.findByIdAndUpdate(id, { $set: { published } }, { new: true });
    if (!doc) throw notFound('Content');
    ok(res, { id: doc._id.toString(), published });
  }),
);

// ----- AI-generated content review queue (kept separate from curated content) -----
adminRouter.get(
  '/ai-quizzes',
  asyncHandler(async (req, res) => {
    const q = query(req, PaginationQuery.extend({ status: z.enum(['unreviewed', 'approved', 'rejected']).default('unreviewed') }));
    const filter = { reviewStatus: q.status };
    const [items, total] = await Promise.all([
      AIQuiz.find(filter).select('+questions.correctAnswer +questions.explanation -userId').sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      AIQuiz.countDocuments(filter),
    ]);
    ok(res, items, 200, pageMeta(q.page, q.limit, total));
  }),
);
adminRouter.post(
  '/ai-quizzes/:id/review',
  asyncHandler(async (req, res) => {
    const { id } = params(req, idParam('id'));
    const { status } = body(req, z.object({ status: z.enum(['approved', 'rejected']) }).strict());
    const r = await AIQuiz.updateOne({ _id: id }, { $set: { reviewStatus: status } });
    if (!r.matchedCount) throw notFound('Quiz');
    ok(res, { id: id.toString(), reviewStatus: status });
  }),
);

// ----- Basic usage metrics (aggregate only, no personal data) -----
adminRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    const today = dayKey(new Date(), 'UTC');
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
    const [users, newUsers, completions, aiUsage, courses] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      LessonAttempt.countDocuments({ status: 'completed', completedAt: { $gte: weekAgo } }),
      AIUsage.aggregate([
        { $match: { day: { $in: days } } },
        {
          $group: {
            _id: '$feature',
            requests: { $sum: '$requests' },
            failures: { $sum: '$failures' },
            inputTokens: { $sum: '$inputTokens' },
            outputTokens: { $sum: '$outputTokens' },
            estimatedCostUsd: { $sum: '$estimatedCostUsd' },
          },
        },
      ]),
      Course.countDocuments({ published: true }),
    ]);
    ok(res, { users, newUsersLast7Days: newUsers, lessonCompletionsLast7Days: completions, publishedCourses: courses, aiUsageLast7Days: aiUsage });
  }),
);
