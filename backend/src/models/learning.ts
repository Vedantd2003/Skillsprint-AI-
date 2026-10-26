import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const AttemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    correct: { type: Boolean, required: true },
    skipped: { type: Boolean, default: false },
    given: { type: Schema.Types.Mixed },
    answeredAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const LessonAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: ['in_progress', 'completed', 'abandoned'], default: 'in_progress' },
    questionIds: { type: [Schema.Types.ObjectId], ref: 'Question', default: [] },
    answers: { type: [AttemptAnswerSchema], default: [] },
    correctCount: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    /** Snapshot of the completion result so retries of /complete are idempotent. */
    result: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);
LessonAttemptSchema.index({ userId: 1, lessonId: 1, status: 1 });
LessonAttemptSchema.index({ userId: 1, createdAt: -1 });
export const LessonAttempt = model('LessonAttempt', LessonAttemptSchema);
export type LessonAttemptDoc = InferSchemaType<typeof LessonAttemptSchema> & { _id: Types.ObjectId };

const UserProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    status: { type: String, enum: ['started', 'completed'], default: 'started' },
    bestScore: { type: Number, default: 0, min: 0, max: 1 },
    timesCompleted: { type: Number, default: 0 },
    firstCompletedAt: { type: Date, default: null },
    lastPracticedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
UserProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
UserProgressSchema.index({ userId: 1, courseId: 1 });
export const UserProgress = model('UserProgress', UserProgressSchema);

/** Per-topic accuracy, derived from real answers (never from the AI). */
const TopicStatSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    topic: { type: String, required: true, maxlength: 80 },
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    lastPracticedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
TopicStatSchema.index({ userId: 1, topic: 1 }, { unique: true });
export const TopicStat = model('TopicStat', TopicStatSchema);

/** Spaced-repetition item (SM-2 inspired). One per user per question. */
const RevisionItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    topic: { type: String, required: true },
    ease: { type: Number, default: 2.5, min: 1.3, max: 3 },
    intervalDays: { type: Number, default: 0, min: 0 },
    reps: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    dueAt: { type: Date, required: true },
    lastResult: { type: String, enum: ['correct', 'wrong', 'skipped'], default: 'wrong' },
    lastPracticedAt: { type: Date, default: null },
    mastered: { type: Boolean, default: false },
  },
  { timestamps: true },
);
RevisionItemSchema.index({ userId: 1, questionId: 1 }, { unique: true });
RevisionItemSchema.index({ userId: 1, mastered: 1, dueAt: 1 });
export const RevisionItem = model('RevisionItem', RevisionItemSchema);
export type RevisionItemDoc = InferSchemaType<typeof RevisionItemSchema> & { _id: Types.ObjectId };

const DailyActivitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, user timezone
    xp: { type: Number, default: 0 },
    lessonsCompleted: { type: Number, default: 0 },
    perfectLessons: { type: Number, default: 0 },
    questionsAnswered: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    revisionAnswered: { type: Number, default: 0 },
  },
  { timestamps: true },
);
DailyActivitySchema.index({ userId: 1, day: 1 }, { unique: true });
export const DailyActivity = model('DailyActivity', DailyActivitySchema);
