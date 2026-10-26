import { Schema, model, type InferSchemaType, Types } from 'mongoose';

export const ROLES = ['learner', 'admin'] as const;
export const UI_LANGUAGES = ['en', 'hi', 'mr'] as const;
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'learner' },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true },
);
UserSchema.index({ email: 1 }, { unique: true });

export const User = model('User', UserSchema);
export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };

const GamificationSubSchema = new Schema(
  {
    totalXp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDay: { type: String, default: null }, // YYYY-MM-DD in user's timezone
    hearts: { type: Number, default: 5, min: 0 },
    heartsUpdatedAt: { type: Date, default: () => new Date() },
    lessonsCompleted: { type: Number, default: 0 },
    perfectLessons: { type: Number, default: 0 },
    unitsCompleted: { type: Number, default: 0 },
    tutorMessages: { type: Number, default: 0 },
    revisionCorrect: { type: Number, default: 0 },
  },
  { _id: false },
);

const UserProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    avatarSeed: { type: String, default: () => Math.random().toString(36).slice(2, 8) },
    friendCode: { type: String, required: true },
    uiLanguage: { type: String, enum: UI_LANGUAGES, default: 'en' },
    tutorLanguage: { type: String, default: 'en', maxlength: 10 },
    learningGoal: { type: String, default: 'general', maxlength: 40 },
    interests: { type: [String], default: [] },
    skillLevel: { type: String, enum: SKILL_LEVELS, default: 'beginner' },
    dailyXpGoal: { type: Number, default: 30, min: 10, max: 200 },
    timezone: { type: String, default: 'Asia/Kolkata', maxlength: 64 },
    currentCourseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    onboardingComplete: { type: Boolean, default: false },
    showOnLeaderboard: { type: Boolean, default: true },
    preferences: {
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      sound: { type: Boolean, default: true },
      animations: { type: Boolean, default: true },
      haptics: { type: Boolean, default: true },
    },
    gamification: { type: GamificationSubSchema, default: () => ({}) },
  },
  { timestamps: true },
);
UserProfileSchema.index({ userId: 1 }, { unique: true });
UserProfileSchema.index({ friendCode: 1 }, { unique: true });
UserProfileSchema.index({ 'gamification.totalXp': -1 });

export const UserProfile = model('UserProfile', UserProfileSchema);
export type UserProfileDoc = InferSchemaType<typeof UserProfileSchema> & { _id: Types.ObjectId };

const NotificationPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remindersEnabled: { type: Boolean, default: true },
    reminderHour: { type: Number, default: 19, min: 0, max: 23 },
    reminderMinute: { type: Number, default: 0, min: 0, max: 59 },
    streakAlerts: { type: Boolean, default: true },
    weeklySummary: { type: Boolean, default: false },
  },
  { timestamps: true },
);
NotificationPreferenceSchema.index({ userId: 1 }, { unique: true });
export const NotificationPreference = model('NotificationPreference', NotificationPreferenceSchema);

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
const RefreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    familyId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    userAgent: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);
RefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
RefreshTokenSchema.index({ userId: 1, familyId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model('RefreshToken', RefreshTokenSchema);

const PasswordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
PasswordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetToken = model('PasswordResetToken', PasswordResetTokenSchema);

const FriendshipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    friendId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
FriendshipSchema.index({ userId: 1, friendId: 1 }, { unique: true });
export const Friendship = model('Friendship', FriendshipSchema);
