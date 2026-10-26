import { Schema, model } from 'mongoose';

/**
 * Append-only XP ledger. `sourceKey` identifies the reward-granting event
 * (e.g. `lesson:<attemptId>`, `unit:<unitId>`, `challenge:<day>`). The unique
 * index on (userId, sourceKey) makes every award idempotent: a retried or
 * duplicated request fails the insert and no XP is granted twice.
 */
const XPTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: {
      type: String,
      enum: [
        'lesson_first_completion',
        'lesson_replay',
        'perfect_bonus',
        'unit_completion',
        'daily_challenge',
        'ai_quiz',
        'revision_session',
        'admin_adjustment',
      ],
      required: true,
    },
    sourceKey: { type: String, required: true, maxlength: 200 },
    day: { type: String, required: true },
    week: { type: String, required: true },
  },
  { timestamps: true },
);
XPTransactionSchema.index({ userId: 1, sourceKey: 1 }, { unique: true });
XPTransactionSchema.index({ userId: 1, createdAt: -1 });
export const XPTransaction = model('XPTransaction', XPTransactionSchema);

const AchievementSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 200 },
    icon: { type: String, default: 'trophy' },
    metric: {
      type: String,
      enum: [
        'lessonsCompleted',
        'currentStreak',
        'totalXp',
        'perfectLessons',
        'unitsCompleted',
        'tutorMessages',
        'revisionCorrect',
      ],
      required: true,
    },
    threshold: { type: Number, required: true, min: 1 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
AchievementSchema.index({ code: 1 }, { unique: true });
export const Achievement = model('Achievement', AchievementSchema);

const UserAchievementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    achievementId: { type: Schema.Types.ObjectId, ref: 'Achievement', required: true },
    unlockedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
UserAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
UserAchievementSchema.index({ userId: 1, unlockedAt: -1 });
export const UserAchievement = model('UserAchievement', UserAchievementSchema);

/** One challenge definition per calendar day (deterministically generated). */
const DailyChallengeSchema = new Schema(
  {
    day: { type: String, required: true },
    type: {
      type: String,
      enum: ['earn_xp', 'complete_lessons', 'revision_answers', 'perfect_lesson'],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    target: { type: Number, required: true, min: 1 },
    bonusXp: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
DailyChallengeSchema.index({ day: 1 }, { unique: true });
export const DailyChallenge = model('DailyChallenge', DailyChallengeSchema);

/** Weekly XP per user. Only the privacy-safe display name is denormalised here. */
const LeaderboardEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    week: { type: String, required: true },
    xp: { type: Number, default: 0 },
  },
  { timestamps: true },
);
LeaderboardEntrySchema.index({ userId: 1, week: 1 }, { unique: true });
LeaderboardEntrySchema.index({ week: 1, xp: -1 });
export const LeaderboardEntry = model('LeaderboardEntry', LeaderboardEntrySchema);

/**
 * Idempotency claims for one-time operations (e.g. finishing a lesson attempt).
 * Inserting a key is atomic thanks to the unique index; only the request that
 * inserts it performs the operation. Keys expire after 30 days.
 */
const IdempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 200 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
IdempotencyKeySchema.index({ key: 1 }, { unique: true });
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });
export const IdempotencyKey = model('IdempotencyKey', IdempotencyKeySchema);
