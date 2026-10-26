import { Schema, model, type InferSchemaType, Types } from 'mongoose';

export const COURSE_CATEGORIES = [
  'english_grammar',
  'english_communication',
  'python',
  'javascript_react',
  'fullstack',
  'ai_genai',
  'dsa',
  'aptitude',
  'interview',
  'professional',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const QUESTION_TYPES = [
  'multiple_choice',
  'true_false',
  'fill_blank',
  'word_order',
  'match_pairs',
  'flashcard',
  'short_answer',
  'code_output',
  'code_fill',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const LESSON_KINDS = ['lesson', 'checkpoint', 'review'] as const;

const CourseSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, maxlength: 120 },
    category: { type: String, enum: COURSE_CATEGORIES, required: true },
    description: { type: String, required: true, maxlength: 1000 },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    estimatedHours: { type: Number, min: 0, default: 1 },
    objectives: { type: [String], default: [] },
    color: { type: String, default: '#6C4CF1' },
    icon: { type: String, default: 'book' },
    tracks: { type: [String], default: [] }, // academy tracks: english, coding, interview, ai
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: false },
  },
  { timestamps: true },
);
CourseSchema.index({ slug: 1 }, { unique: true });
CourseSchema.index({ published: 1, order: 1 });
export const Course = model('Course', CourseSchema);
export type CourseDoc = InferSchemaType<typeof CourseSchema> & { _id: Types.ObjectId };

const UnitSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    key: { type: String, required: true, maxlength: 120 },
    order: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    rewardXp: { type: Number, default: 20, min: 0 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);
UnitSchema.index({ courseId: 1, order: 1 });
UnitSchema.index({ key: 1 }, { unique: true });
export const Unit = model('Unit', UnitSchema);

const LessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    key: { type: String, required: true, maxlength: 160 },
    order: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 120 },
    summary: { type: String, default: '', maxlength: 500 },
    kind: { type: String, enum: LESSON_KINDS, default: 'lesson' },
    topic: { type: String, required: true, maxlength: 80 },
    xpReward: { type: Number, default: 15, min: 0, max: 200 },
    /** Explicit prerequisites. If empty, the previous lesson in the course (by unit/order) is required. */
    prerequisites: { type: [Schema.Types.ObjectId], ref: 'Lesson', default: [] },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);
LessonSchema.index({ courseId: 1, unitId: 1, order: 1 });
LessonSchema.index({ key: 1 }, { unique: true });
export const Lesson = model('Lesson', LessonSchema);
export type LessonDoc = InferSchemaType<typeof LessonSchema> & { _id: Types.ObjectId };

/**
 * Curated, reviewed questions. `answer` is never returned to clients before a
 * submission (select: false) — answers are checked on the server.
 */
const QuestionSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    key: { type: String, required: true, maxlength: 200 },
    order: { type: Number, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    prompt: { type: String, required: true, maxlength: 2000 },
    instructions: { type: String, default: '', maxlength: 300 },
    /** Public, type-specific payload: options, words, pairs, code, etc. */
    data: { type: Schema.Types.Mixed, default: {} },
    /** Private answer key — see answerChecker for the per-type shape. */
    answer: { type: Schema.Types.Mixed, required: true, select: false },
    explanation: { type: String, required: true, maxlength: 1500 },
    topic: { type: String, required: true, maxlength: 80 },
    difficulty: { type: Number, min: 1, max: 5, default: 1 },
    source: { type: String, enum: ['curated'], default: 'curated' },
  },
  { timestamps: true, minimize: false },
);
QuestionSchema.index({ lessonId: 1, order: 1 });
QuestionSchema.index({ key: 1 }, { unique: true });
export const Question = model('Question', QuestionSchema);
export type QuestionDoc = InferSchemaType<typeof QuestionSchema> & { _id: Types.ObjectId };
