import { Schema, model } from 'mongoose';
import { env } from '../config/env';

export const AI_MODES = ['tutor', 'roleplay', 'grammar', 'interview'] as const;

const AIConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    mode: { type: String, enum: AI_MODES, default: 'tutor' },
    language: { type: String, default: 'en', maxlength: 10 },
    context: {
      courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
      lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
      scenario: { type: String, default: null, maxlength: 200 },
    },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
AIConversationSchema.index({ userId: 1, lastMessageAt: -1 });
export const AIConversation = model('AIConversation', AIConversationSchema);

/**
 * Chat messages. Users are told in-app that tutor chats are stored so they can
 * revisit them; they can delete any conversation, and messages expire after
 * AI_MESSAGE_RETENTION_DAYS via a TTL index.
 */
const AIMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'AIConversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 12000 },
  },
  { timestamps: true },
);
AIMessageSchema.index({ conversationId: 1, createdAt: 1 });
AIMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: env.AI_MESSAGE_RETENTION_DAYS * 86_400 });
export const AIMessage = model('AIMessage', AIMessageSchema);

/**
 * AI-generated quizzes live in their own collection, separate from curated
 * course content, with the answer key stored server-side only.
 */
const AIQuizSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 160 },
    topic: { type: String, required: true, maxlength: 120 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    questions: [
      {
        _id: false,
        id: { type: String, required: true },
        type: { type: String, enum: ['multiple_choice', 'true_false'], required: true },
        question: { type: String, required: true },
        options: { type: [String], required: true },
        correctAnswer: { type: Number, required: true, select: false },
        explanation: { type: String, required: true, select: false },
      },
    ],
    reviewStatus: { type: String, enum: ['unreviewed', 'approved', 'rejected'], default: 'unreviewed' },
    submittedAt: { type: Date, default: null },
    score: { type: Number, default: null },
  },
  { timestamps: true },
);
AIQuizSchema.index({ userId: 1, createdAt: -1 });
export const AIQuiz = model('AIQuiz', AIQuizSchema);

/** Per-user, per-day, per-feature usage for quotas and approximate cost tracking. */
const AIUsageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    feature: { type: String, required: true },
    requests: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
);
AIUsageSchema.index({ userId: 1, day: 1, feature: 1 }, { unique: true });
AIUsageSchema.index({ day: 1 });
export const AIUsage = model('AIUsage', AIUsageSchema);
