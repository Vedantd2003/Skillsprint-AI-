import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { asyncHandler, ok, pageMeta, PaginationQuery } from '../../lib/http';
import { authed, requireAuth } from '../../middleware/auth';
import { idParam, params, query } from '../../middleware/validate';
import { Course, UserProfile } from '../../models';
import { COURSE_CATEGORIES } from '../../models/content';
import { buildCourseMap, courseProgressSummaries } from './courseMap';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const ListQuery = PaginationQuery.extend({
  category: z.enum(COURSE_CATEGORIES).optional(),
  track: z.enum(['english', 'coding', 'interview', 'ai', 'aptitude', 'professional']).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

const courseCard = (c: {
  _id: { toString(): string };
  slug: string;
  title: string;
  category: string;
  description: string;
  level?: string | null;
  estimatedHours?: number | null;
  objectives?: string[];
  color?: string | null;
  icon?: string | null;
  tracks?: string[];
}) => ({
  id: c._id.toString(),
  slug: c.slug,
  title: c.title,
  category: c.category,
  description: c.description,
  level: c.level,
  estimatedHours: c.estimatedHours,
  objectives: c.objectives ?? [],
  color: c.color,
  icon: c.icon,
  tracks: c.tracks ?? [],
});

coursesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const q = query(req, ListQuery);
    const filter: Record<string, unknown> = { published: true };
    if (q.category) filter.category = q.category;
    if (q.track) filter.tracks = q.track;
    if (q.level) filter.level = q.level;
    const [items, total] = await Promise.all([
      Course.find(filter).sort({ order: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      Course.countDocuments(filter),
    ]);
    const progressOf = await courseProgressSummaries(u.oid, items.map((c) => c._id));
    ok(
      res,
      items.map((c) => ({ ...courseCard(c), progress: progressOf(c._id) })),
      200,
      pageMeta(q.page, q.limit, total),
    );
  }),
);

coursesRouter.get(
  '/:courseId',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { courseId } = params(req, idParam('courseId'));
    const course = await Course.findOne({ _id: courseId, published: true }).lean();
    if (!course) throw notFound('Course');
    const map = await buildCourseMap(u.oid, courseId);
    ok(res, {
      ...courseCard(course),
      units: map.units.map(({ lessons, ...unit }) => ({ ...unit, lessonCount: lessons.length })),
      progress: {
        totalLessons: map.totals.lessons,
        completedLessons: map.totals.completed,
        percent: map.totals.lessons ? Math.round((map.totals.completed / map.totals.lessons) * 100) : 0,
      },
      nextLesson: map.nextLesson,
    });
  }),
);

/** Full learning path with per-lesson lock state. */
coursesRouter.get(
  '/:courseId/units',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { courseId } = params(req, idParam('courseId'));
    const course = await Course.findOne({ _id: courseId, published: true }).lean();
    if (!course) throw notFound('Course');
    const map = await buildCourseMap(u.oid, courseId);
    ok(res, { course: courseCard(course), units: map.units, totals: map.totals, nextLesson: map.nextLesson });
  }),
);

/** Sets the learner's current course (used by the Home dashboard and learning path). */
coursesRouter.post(
  '/:courseId/enroll',
  asyncHandler(async (req, res) => {
    const u = authed(req);
    const { courseId } = params(req, idParam('courseId'));
    if (!(await Course.exists({ _id: courseId, published: true }))) throw notFound('Course');
    await UserProfile.updateOne({ userId: u.oid }, { $set: { currentCourseId: courseId } });
    ok(res, { currentCourseId: courseId.toString() });
  }),
);
