import { Types } from 'mongoose';
import { Course, Lesson, Unit, UserProgress } from '../../models';

export type LessonStatus = 'locked' | 'available' | 'started' | 'completed';

export interface MapLesson {
  id: string;
  key: string;
  title: string;
  summary: string;
  kind: 'lesson' | 'checkpoint' | 'review';
  topic: string;
  xpReward: number;
  order: number;
  status: LessonStatus;
  bestScore: number;
  prerequisites: string[];
}

export interface MapUnit {
  id: string;
  title: string;
  description: string;
  order: number;
  rewardXp: number;
  completedLessons: number;
  totalLessons: number;
  completed: boolean;
  lessons: MapLesson[];
}

/**
 * Builds the learning path for a course and computes each lesson's state from
 * persisted progress. A lesson is unlocked when all its prerequisites are
 * completed; when none are set explicitly, the previous lesson in course order
 * is the prerequisite. This is the single source of truth for unlocking and is
 * enforced again on lesson start — the client's view is never trusted.
 */
export async function buildCourseMap(userId: Types.ObjectId, courseId: Types.ObjectId) {
  const [units, lessons, progress] = await Promise.all([
    Unit.find({ courseId, published: true }).sort({ order: 1 }).lean(),
    Lesson.find({ courseId, published: true }).sort({ order: 1 }).lean(),
    UserProgress.find({ userId, courseId }).lean(),
  ]);
  const progressByLesson = new Map(progress.map((p) => [p.lessonId.toString(), p]));
  const unitOrder = new Map(units.map((u) => [u._id.toString(), u.order]));
  const ordered = lessons
    .filter((l) => unitOrder.has(l.unitId.toString()))
    .sort((a, b) => unitOrder.get(a.unitId.toString())! - unitOrder.get(b.unitId.toString())! || a.order - b.order);

  const completed = new Set(
    progress.filter((p) => p.status === 'completed').map((p) => p.lessonId.toString()),
  );

  const prereqsOf = new Map<string, string[]>();
  ordered.forEach((l, i) => {
    const explicit = (l.prerequisites ?? []).map((p) => p.toString());
    prereqsOf.set(l._id.toString(), explicit.length ? explicit : i > 0 ? [ordered[i - 1]!._id.toString()] : []);
  });

  const statusOf = (id: string): LessonStatus => {
    const p = progressByLesson.get(id);
    if (p?.status === 'completed') return 'completed';
    const unlocked = (prereqsOf.get(id) ?? []).every((pid) => completed.has(pid));
    if (!unlocked) return 'locked';
    return p?.status === 'started' ? 'started' : 'available';
  };

  const mapUnits: MapUnit[] = units.map((u) => {
    const uLessons = ordered.filter((l) => l.unitId.toString() === u._id.toString());
    const mapped: MapLesson[] = uLessons.map((l) => ({
      id: l._id.toString(),
      key: l.key,
      title: l.title,
      summary: l.summary,
      kind: l.kind as MapLesson['kind'],
      topic: l.topic,
      xpReward: l.xpReward,
      order: l.order,
      status: statusOf(l._id.toString()),
      bestScore: progressByLesson.get(l._id.toString())?.bestScore ?? 0,
      prerequisites: prereqsOf.get(l._id.toString()) ?? [],
    }));
    const done = mapped.filter((m) => m.status === 'completed').length;
    return {
      id: u._id.toString(),
      title: u.title,
      description: u.description,
      order: u.order,
      rewardXp: u.rewardXp,
      completedLessons: done,
      totalLessons: mapped.length,
      completed: mapped.length > 0 && done === mapped.length,
      lessons: mapped,
    };
  });

  const flat = mapUnits.flatMap((u) => u.lessons);
  const next = flat.find((l) => l.status === 'started') ?? flat.find((l) => l.status === 'available') ?? null;
  return {
    units: mapUnits,
    totals: { lessons: flat.length, completed: flat.filter((l) => l.status === 'completed').length },
    nextLesson: next ? { id: next.id, title: next.title } : null,
    statusOf: (id: string) => flat.find((l) => l.id === id)?.status ?? 'locked',
  };
}

export async function courseProgressSummaries(userId: Types.ObjectId, courseIds: Types.ObjectId[]) {
  const [lessonCounts, doneCounts] = await Promise.all([
    Lesson.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { courseId: { $in: courseIds }, published: true } },
      { $group: { _id: '$courseId', n: { $sum: 1 } } },
    ]),
    UserProgress.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { userId, courseId: { $in: courseIds }, status: 'completed' } },
      { $group: { _id: '$courseId', n: { $sum: 1 } } },
    ]),
  ]);
  const total = new Map(lessonCounts.map((c) => [c._id.toString(), c.n]));
  const done = new Map(doneCounts.map((c) => [c._id.toString(), c.n]));
  return (id: Types.ObjectId) => {
    const t = total.get(id.toString()) ?? 0;
    const d = done.get(id.toString()) ?? 0;
    return { totalLessons: t, completedLessons: d, percent: t ? Math.round((d / t) * 100) : 0 };
  };
}

export async function getPublishedCourse(courseId: Types.ObjectId) {
  return Course.findOne({ _id: courseId, published: true }).lean();
}
