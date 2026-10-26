/**
 * Repeatable content seed. Safe to run any number of times: every course,
 * unit, lesson and question is upserted by a stable key, and every answer key
 * is validated before anything is written. Learner data is never touched.
 *
 *   npm run seed            (development, TypeScript)
 *   npm run seed:prod       (after build, e.g. on Render)
 */
import mongoose from 'mongoose';
import { connectDb } from '../db';
import { logger } from '../lib/logger';
import { Achievement, Course, Lesson, Question, Unit } from '../models';
import { validateAnswerKey } from '../modules/lessons/answerChecker';
import type { CourseSpec } from './builders';
import { aiGenai, aptitude, interviewPrep, professional } from './content/careers';
import { dsa, fullstack, javascriptReact, python } from './content/coding';
import { englishCommunication, englishGrammar } from './content/english';

export const COURSES: CourseSpec[] = [
  englishGrammar,
  englishCommunication,
  python,
  javascriptReact,
  fullstack,
  aiGenai,
  dsa,
  aptitude,
  interviewPrep,
  professional,
];

export const ACHIEVEMENTS = [
  { code: 'first_steps', title: 'First Steps', description: 'Complete your first lesson', icon: 'flag', metric: 'lessonsCompleted', threshold: 1 },
  { code: 'on_a_roll', title: 'On a Roll', description: 'Complete 10 lessons', icon: 'trending-up', metric: 'lessonsCompleted', threshold: 10 },
  { code: 'scholar', title: 'Scholar', description: 'Complete 25 lessons', icon: 'award', metric: 'lessonsCompleted', threshold: 25 },
  { code: 'streak_3', title: 'Warming Up', description: 'Reach a 3-day streak', icon: 'zap', metric: 'currentStreak', threshold: 3 },
  { code: 'streak_7', title: 'Week Warrior', description: 'Reach a 7-day streak', icon: 'sun', metric: 'currentStreak', threshold: 7 },
  { code: 'streak_30', title: 'Unstoppable', description: 'Reach a 30-day streak', icon: 'star', metric: 'currentStreak', threshold: 30 },
  { code: 'xp_100', title: 'Century', description: 'Earn 100 XP', icon: 'hexagon', metric: 'totalXp', threshold: 100 },
  { code: 'xp_1000', title: 'XP Hunter', description: 'Earn 1,000 XP', icon: 'target', metric: 'totalXp', threshold: 1000 },
  { code: 'perfectionist', title: 'Perfectionist', description: 'Finish a lesson with no mistakes', icon: 'check-circle', metric: 'perfectLessons', threshold: 1 },
  { code: 'flawless_5', title: 'Flawless Five', description: 'Finish 5 lessons with no mistakes', icon: 'shield', metric: 'perfectLessons', threshold: 5 },
  { code: 'unit_cleared', title: 'Unit Cleared', description: 'Complete a whole unit', icon: 'layers', metric: 'unitsCompleted', threshold: 1 },
  { code: 'curious_mind', title: 'Curious Mind', description: 'Ask the AI tutor your first question', icon: 'message-circle', metric: 'tutorMessages', threshold: 1 },
  { code: 'memory_master', title: 'Memory Master', description: 'Answer 20 revision questions correctly', icon: 'repeat', metric: 'revisionCorrect', threshold: 20 },
] as const;

export function validateContent(courses: CourseSpec[]) {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const c of courses) {
    for (const u of c.units) {
      for (const l of u.lessons) {
        if (l.questions.length < 3) errors.push(`${c.slug}/${u.slug}/${l.slug}: needs at least 3 questions`);
        l.questions.forEach((q, i) => {
          const key = `${c.slug}:${u.slug}:${l.slug}:${i}`;
          if (keys.has(key)) errors.push(`duplicate key ${key}`);
          keys.add(key);
          const err = validateAnswerKey(q.type, q.answer, q.data);
          if (err) errors.push(`${key}: ${err}`);
        });
      }
    }
  }
  return errors;
}

export async function seed(options: { publish?: boolean } = {}) {
  const errors = validateContent(COURSES);
  if (errors.length) throw new Error(`Seed content is invalid:\n${errors.join('\n')}`);

  for (const a of ACHIEVEMENTS) {
    await Achievement.updateOne({ code: a.code }, { $set: { ...a, order: ACHIEVEMENTS.indexOf(a) } }, { upsert: true });
  }

  let lessonCount = 0;
  let questionCount = 0;
  for (const [ci, c] of COURSES.entries()) {
    const { units, ...courseFields } = c;
    const course = await Course.findOneAndUpdate(
      { slug: c.slug },
      { $set: { ...courseFields, order: ci, published: options.publish ?? true } },
      { upsert: true, new: true },
    );
    for (const [ui, u] of units.entries()) {
      const unitKey = `${c.slug}:${u.slug}`;
      const unit = await Unit.findOneAndUpdate(
        { key: unitKey },
        { $set: { key: unitKey, courseId: course._id, order: ui, title: u.title, description: u.description, rewardXp: u.rewardXp ?? 20, published: true } },
        { upsert: true, new: true },
      );
      for (const [li, l] of u.lessons.entries()) {
        const lessonKey = `${unitKey}:${l.slug}`;
        const lesson = await Lesson.findOneAndUpdate(
          { key: lessonKey },
          {
            $set: {
              key: lessonKey,
              courseId: course._id,
              unitId: unit._id,
              order: li,
              title: l.title,
              summary: l.summary,
              kind: l.kind ?? 'lesson',
              topic: l.topic,
              xpReward: l.xpReward ?? 15,
              published: true,
            },
          },
          { upsert: true, new: true },
        );
        lessonCount++;
        const keep: string[] = [];
        for (const [qi, q] of l.questions.entries()) {
          const qKey = `${lessonKey}:${qi}`;
          keep.push(qKey);
          await Question.updateOne(
            { key: qKey },
            {
              $set: {
                key: qKey,
                lessonId: lesson._id,
                order: qi,
                type: q.type,
                prompt: q.prompt,
                instructions: q.instructions ?? '',
                data: q.data,
                answer: q.answer,
                explanation: q.explanation,
                topic: q.topic ?? l.topic,
                difficulty: q.difficulty ?? 1,
                source: 'curated',
              },
            },
            { upsert: true },
          );
          questionCount++;
        }
        // Remove questions that were deleted from the seed file for this lesson.
        await Question.deleteMany({ lessonId: lesson._id, key: { $nin: keep } });
      }
    }
  }
  logger.info({ courses: COURSES.length, lessons: lessonCount, questions: questionCount, achievements: ACHIEVEMENTS.length }, 'Seed complete');
  return { courses: COURSES.length, lessons: lessonCount, questions: questionCount };
}

if (require.main === module) {
  connectDb()
    .then(() => seed())
    .then((r) => {
      console.log(`Seeded ${r.courses} courses, ${r.lessons} lessons, ${r.questions} questions.`);
      return mongoose.disconnect();
    })
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
