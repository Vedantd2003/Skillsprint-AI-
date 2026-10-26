import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, notFound, tooMany } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { uuid } from '../../lib/crypto';
import {
  AIConversation,
  AIMessage,
  AIQuiz,
  AIUsage,
  Course,
  Lesson,
  Question,
  RevisionItem,
  UserProfile,
  UserProgress,
} from '../../models';
import { buildCourseMap } from '../courses/courseMap';
import * as gx from '../gamification/engine';
import { checkAnswer } from '../lessons/answerChecker';
import { weakTopics } from '../revision/revision.service';
import { GeminiProvider } from './gemini.provider';
import { MockProvider } from './mock.provider';
import * as P from './prompts';
import { AIProviderError, type AIProvider, type Usage } from './provider';
import {
  INTERVIEW_EVAL_JSON_SCHEMA,
  INTERVIEW_QUESTION_JSON_SCHEMA,
  InterviewEvalSchema,
  InterviewQuestionSchema,
  QUIZ_JSON_SCHEMA,
  STUDY_PLAN_JSON_SCHEMA,
  StudyPlanSchema,
  validateQuiz,
} from './schemas';

// ---------- Provider wiring ----------

let provider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (provider) return provider;
  if (env.AI_PROVIDER === 'mock') provider = new MockProvider();
  else if (env.GEMINI_API_KEY) provider = new GeminiProvider(env.GEMINI_API_KEY);
  else throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI tutor is not configured on this server yet.');
  return provider;
}

/** Test hook: inject a provider (e.g. MockProvider). */
export function setProvider(p: AIProvider | null) {
  provider = p;
}

export function aiStatus() {
  const configured = env.AI_PROVIDER === 'mock' || Boolean(env.GEMINI_API_KEY) || Boolean(provider);
  return { enabled: configured, provider: provider?.name ?? env.AI_PROVIDER, model: provider?.model ?? env.GEMINI_MODEL };
}

// ---------- Quotas, usage and error mapping ----------

type Feature = 'tutor' | 'quiz' | 'explanation' | 'study_plan' | 'interview';

async function enforceDailyQuota(userId: Types.ObjectId, day: string) {
  const [agg] = await AIUsage.aggregate<{ total: number }>([
    { $match: { userId, day } },
    { $group: { _id: null, total: { $sum: '$requests' } } },
  ]);
  if ((agg?.total ?? 0) >= env.AI_DAILY_REQUEST_LIMIT) {
    throw tooMany(
      `You've reached today's AI limit (${env.AI_DAILY_REQUEST_LIMIT} requests). It resets tomorrow — lessons and revision are still available.`,
      'AI_DAILY_QUOTA',
    );
  }
}

const estimateCost = (u: Usage) =>
  (u.inputTokens * env.AI_INPUT_COST_PER_MTOK + u.outputTokens * env.AI_OUTPUT_COST_PER_MTOK) / 1_000_000;

async function trackUsage(userId: Types.ObjectId, day: string, feature: Feature, usage: Usage | null) {
  await AIUsage.updateOne(
    { userId, day, feature },
    {
      $inc: {
        requests: 1,
        failures: usage ? 0 : 1,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        estimatedCostUsd: usage ? estimateCost(usage) : 0,
      },
    },
    { upsert: true },
  );
}

function toAppError(err: AIProviderError): AppError {
  switch (err.kind) {
    case 'not_configured':
      return new AppError(503, 'AI_NOT_CONFIGURED', 'The AI tutor is not available right now. Please try again later.');
    case 'quota':
      return new AppError(503, 'AI_BUSY', 'The AI tutor is very busy right now. Please try again in a minute.');
    case 'blocked':
      return new AppError(422, 'AI_BLOCKED', "The tutor couldn't answer that. Try rephrasing your question.");
    case 'invalid_output':
    case 'bad_request':
      return new AppError(502, 'AI_INVALID_OUTPUT', 'The AI response could not be validated. Please try again.');
    default:
      return new AppError(503, 'AI_UNAVAILABLE', 'The AI tutor is temporarily unavailable. Please try again shortly.');
  }
}

/** Runs an AI operation with quota enforcement, usage tracking, request id logging and safe errors. */
async function run<T>(userId: Types.ObjectId, feature: Feature, requestId: string | undefined, fn: (p: AIProvider) => Promise<{ value: T; usage: Usage }>): Promise<T> {
  const p = getProvider();
  const profile = await gx.getProfile(userId);
  const day = gx.todayFor(profile.timezone);
  await enforceDailyQuota(userId, day);
  try {
    const { value, usage } = await fn(p);
    await trackUsage(userId, day, feature, usage);
    return value;
  } catch (err) {
    await trackUsage(userId, day, feature, null);
    if (err instanceof AIProviderError) {
      logger.warn({ requestId, feature, kind: err.kind }, 'AI request failed');
      throw toAppError(err);
    }
    throw err;
  }
}

const sumUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });

// ---------- Learner context (always from the DB, never from the client) ----------

async function learnerContext(userId: Types.ObjectId, language?: string, lessonId?: Types.ObjectId | null): Promise<P.LearnerContext> {
  const profile = await gx.getProfile(userId);
  let lesson: P.LearnerContext['lesson'] = null;
  if (lessonId) {
    const l = await Lesson.findOne({ _id: lessonId, published: true }).lean();
    if (l) {
      const c = await Course.findById(l.courseId).select('title').lean();
      lesson = { title: l.title, topic: l.topic, summary: l.summary, courseTitle: c?.title ?? '' };
    }
  }
  const weak = await weakTopics(userId, 3);
  return {
    displayName: profile.displayName,
    skillLevel: profile.skillLevel,
    learningGoal: profile.learningGoal,
    language: language ?? profile.tutorLanguage ?? 'en',
    lesson,
    weakTopics: weak.map((w) => ({ topic: w.topic, accuracy: w.accuracy })),
  };
}

// ---------- Tutor chat ----------

const HISTORY_TURNS = 12;

export async function tutorChat(
  userId: Types.ObjectId,
  input: {
    conversationId?: Types.ObjectId;
    message: string;
    language?: string;
    mode?: 'tutor' | 'roleplay' | 'grammar';
    lessonId?: Types.ObjectId;
    scenario?: string;
  },
  requestId?: string,
) {
  const receivedAt = new Date();
  let convo = input.conversationId
    ? await AIConversation.findOne({ _id: input.conversationId, userId }) // ownership enforced
    : null;
  if (input.conversationId && !convo) throw notFound('Conversation');

  if (!convo) {
    const lesson = input.lessonId ? await Lesson.findOne({ _id: input.lessonId, published: true }).lean() : null;
    convo = await AIConversation.create({
      userId,
      title: input.message.replace(/\s+/g, ' ').slice(0, 60) || 'New chat',
      mode: input.mode ?? 'tutor',
      language: input.language ?? 'en',
      context: { courseId: lesson?.courseId ?? null, lessonId: lesson?._id ?? null, scenario: input.scenario ?? null },
    });
  }

  const ctx = await learnerContext(userId, input.language ?? convo.language, convo.context?.lessonId ?? null);
  const system =
    convo.mode === 'roleplay'
      ? P.roleplaySystem(ctx, convo.context?.scenario ?? 'A job interview for an entry-level role')
      : convo.mode === 'grammar'
        ? P.grammarSystem(ctx)
        : P.tutorSystem(ctx);

  const history = await AIMessage.find({ conversationId: convo._id, userId }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_TURNS).lean();
  const messages = history
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.role === 'user' ? `<learner_input>${m.content}</learner_input>` : m.content }));
  messages.push({ role: 'user', content: `<learner_input>${input.message}</learner_input>` });

  const reply = await run(userId, 'tutor', requestId, async (p) => {
    const r = await p.generateText({ system, messages, maxOutputTokens: Math.min(env.AI_MAX_OUTPUT_TOKENS, 1500) });
    return { value: r.text.slice(0, 8000), usage: r.usage };
  });

  // Explicit, strictly increasing timestamps keep the pair in order.
  const replyAt = new Date(Math.max(Date.now(), receivedAt.getTime() + 1));
  const userMsg = await AIMessage.create({ conversationId: convo._id, userId, role: 'user', content: input.message, createdAt: receivedAt });
  const aiMsg = await AIMessage.create({ conversationId: convo._id, userId, role: 'assistant', content: reply, createdAt: replyAt });
  await AIConversation.updateOne({ _id: convo._id }, { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } });
  await UserProfile.updateOne({ userId }, { $inc: { 'gamification.tutorMessages': 1 } });
  const achievements = await gx.checkAchievements(userId);

  return {
    conversationId: convo._id.toString(),
    mode: convo.mode,
    userMessage: { id: userMsg._id.toString(), role: 'user', content: input.message, createdAt: userMsg.createdAt },
    reply: { id: aiMsg._id.toString(), role: 'assistant', content: reply, createdAt: aiMsg.createdAt },
    disclaimer: 'AI-generated — double-check important facts.',
    achievements,
  };
}

// ---------- Quizzes ----------

export async function generateQuiz(
  userId: Types.ObjectId,
  input: { topic: string; difficulty: 'easy' | 'medium' | 'hard'; count: number; language?: string; lessonId?: Types.ObjectId },
  requestId?: string,
) {
  const ctx = await learnerContext(userId, input.language, input.lessonId ?? null);
  const { system, prompt } = P.quizPrompt(input.topic, input.difficulty, input.count, ctx, ctx.lesson?.title);
  const outputBudget = Math.min(env.AI_MAX_OUTPUT_TOKENS * 2, 400 + input.count * 350);

  const result = await run(userId, 'quiz', requestId, async (p) => {
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    // One regeneration if too many questions fail validation.
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await p.generateJson({ system, prompt, jsonSchema: QUIZ_JSON_SCHEMA, maxOutputTokens: outputBudget });
      usage = sumUsage(usage, r.usage);
      const v = validateQuiz(r.data, input.count);
      if (v.ok) return { value: v, usage };
      logger.warn({ requestId, reason: v.reason, rejected: v.rejected }, 'Quiz output failed validation');
    }
    throw new AIProviderError('invalid_output', 'Quiz failed validation twice');
  });

  const quiz = await AIQuiz.create({
    userId,
    title: result.title ?? `${input.topic} quiz`,
    topic: input.topic.slice(0, 120),
    difficulty: input.difficulty,
    questions: result.valid.map((q) => ({ id: uuid(), ...q })),
  });
  return publicQuiz(quiz, result.rejected);
}

function publicQuiz(quiz: InstanceType<typeof AIQuiz>, rejected = 0) {
  return {
    id: quiz._id.toString(),
    title: quiz.title,
    topic: quiz.topic,
    difficulty: quiz.difficulty,
    aiGenerated: true,
    reviewStatus: quiz.reviewStatus,
    rejectedQuestions: rejected,
    submitted: Boolean(quiz.submittedAt),
    // Answer keys and explanations are withheld until submission.
    questions: quiz.questions.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options })),
  };
}

export async function getQuiz(userId: Types.ObjectId, quizId: Types.ObjectId) {
  const quiz = await AIQuiz.findOne({ _id: quizId, userId });
  if (!quiz) throw notFound('Quiz');
  return publicQuiz(quiz);
}

export async function submitQuiz(userId: Types.ObjectId, quizId: Types.ObjectId, answers: { questionId: string; answer: number }[]) {
  const quiz = await AIQuiz.findOne({ _id: quizId, userId }).select('+questions.correctAnswer +questions.explanation');
  if (!quiz) throw notFound('Quiz');
  const byId = new Map(answers.map((a) => [a.questionId, a.answer]));
  const results = quiz.questions.map((q) => {
    const given = byId.get(q.id);
    const correct = typeof given === 'number' && given === q.correctAnswer;
    return {
      questionId: q.id,
      given: given ?? null,
      correct,
      correctAnswer: q.correctAnswer,
      correctOption: q.options[q.correctAnswer],
      explanation: q.explanation,
    };
  });
  const score = results.filter((r) => r.correct).length;
  const profile = await gx.getProfile(userId);
  let xpEarned = 0;
  if (!quiz.submittedAt) {
    await AIQuiz.updateOne({ _id: quiz._id, submittedAt: null }, { $set: { submittedAt: new Date(), score } });
    // Ledger key makes the reward once-per-quiz even if submitted repeatedly.
    if (score > 0) xpEarned = await gx.awardXp(userId, profile.timezone, env.XP_AI_QUIZ, 'ai_quiz', `ai-quiz:${quiz._id}`);
  }
  return {
    quizId: quiz._id.toString(),
    score,
    total: results.length,
    results,
    xpEarned,
    note: 'These questions were generated by AI and have not been reviewed by an educator.',
  };
}

// ---------- Explanations for mistakes ----------

export async function explainMistake(
  userId: Types.ObjectId,
  input: { questionId: Types.ObjectId; givenAnswer: string; language?: string },
  requestId?: string,
) {
  const question = await Question.findById(input.questionId).select('+answer').lean();
  if (!question) throw notFound('Question');
  // Only explain questions the learner has actually encountered.
  const seen =
    (await RevisionItem.exists({ userId, questionId: question._id })) ||
    (await UserProgress.exists({ userId, lessonId: question.lessonId }));
  if (!seen) throw notFound('Question');
  const correct = checkAnswer(question.type, question.answer as Record<string, unknown>, question.data ?? {}, defaultGiven(question.type));
  const ctx = await learnerContext(userId, input.language, question.lessonId);
  const text = await run(userId, 'explanation', requestId, async (p) => {
    const r = await p.generateText({
      system: P.explainMistakePrompt({ prompt: question.prompt, correctAnswer: correct.correctAnswer, explanation: question.explanation }, input.givenAnswer, ctx),
      messages: [{ role: 'user', content: 'Please explain my mistake.' }],
      maxOutputTokens: 500,
      temperature: 0.4,
    });
    return { value: r.text, usage: r.usage };
  });
  return { explanation: text, correctAnswer: correct.correctAnswer, referenceExplanation: question.explanation, isEstimate: true };
}

function defaultGiven(type: string): unknown {
  return type === 'multiple_choice' ? 0 : type === 'true_false' ? true : type === 'word_order' ? [] : type === 'flashcard' ? { knew: false } : type === 'match_pairs' ? [] : '';
}

// ---------- Study plan ----------

export async function studyPlan(userId: Types.ObjectId, input: { days: number; focus?: string; language?: string }, requestId?: string) {
  const profile = await gx.getProfile(userId);
  const ctx = await learnerContext(userId, input.language, null);
  const courseId = profile.currentCourseId ?? (await Course.findOne({ published: true }).sort({ order: 1 }).select('_id').lean())?._id;
  const available: { id: string; title: string; course: string; topic: string }[] = [];
  if (courseId) {
    const map = await buildCourseMap(userId, courseId);
    const course = await Course.findById(courseId).select('title').lean();
    for (const l of map.units.flatMap((u) => u.lessons)) {
      if (l.status === 'available' || l.status === 'started') available.push({ id: l.id, title: l.title, course: course?.title ?? '', topic: l.topic });
      if (available.length >= 6) break;
    }
    // Also the following locked lessons in order, which will unlock as the plan progresses.
    for (const l of map.units.flatMap((u) => u.lessons).filter((x) => x.status === 'locked').slice(0, 6)) {
      available.push({ id: l.id, title: l.title, course: course?.title ?? '', topic: l.topic });
    }
  }
  const dueReviews = await RevisionItem.countDocuments({ userId, mastered: false, dueAt: { $lte: new Date() } });
  const { system, prompt } = P.studyPlanPrompt(ctx, { dailyXpGoal: profile.dailyXpGoal, days: input.days, availableLessons: available, dueReviews, focus: input.focus });

  const plan = await run(userId, 'study_plan', requestId, async (p) => {
    const r = await p.generateJson({ system, prompt, jsonSchema: STUDY_PLAN_JSON_SCHEMA, maxOutputTokens: 1800 });
    const parsed = StudyPlanSchema.safeParse(r.data);
    if (!parsed.success) throw new AIProviderError('invalid_output', 'Study plan failed validation');
    return { value: parsed.data, usage: r.usage };
  });

  // Never trust model-provided ids: keep only lessons that exist in our list.
  const allowed = new Map(available.map((a) => [a.id, a]));
  const days = plan.days.slice(0, input.days).map((d) => ({
    ...d,
    tasks: d.tasks.map((t) => {
      if (t.type === 'lesson' && t.lessonId && !allowed.has(t.lessonId)) {
        const { lessonId: _drop, ...rest } = t;
        void _drop;
        return rest;
      }
      return t.lessonId ? { ...t, lessonTitle: allowed.get(t.lessonId)?.title } : t;
    }),
  }));
  return {
    ...plan,
    days,
    basedOn: { weakTopics: ctx.weakTopics ?? [], dueReviews, dailyXpGoal: profile.dailyXpGoal },
    isEstimate: true,
  };
}

// ---------- Interview practice ----------

export async function interviewPractice(
  userId: Types.ObjectId,
  input: { mode: 'hr' | 'technical'; role: string; question?: string; answer?: string; previousQuestions?: string[]; language?: string },
  requestId?: string,
) {
  const ctx = await learnerContext(userId, input.language, null);
  if (!input.answer) {
    const { system, prompt } = P.interviewQuestionPrompt(input.mode, input.role, ctx, input.previousQuestions ?? []);
    const q = await run(userId, 'interview', requestId, async (p) => {
      const r = await p.generateJson({ system, prompt, jsonSchema: INTERVIEW_QUESTION_JSON_SCHEMA, maxOutputTokens: 600 });
      const parsed = InterviewQuestionSchema.safeParse(r.data);
      if (!parsed.success) throw new AIProviderError('invalid_output', 'Interview question failed validation');
      return { value: parsed.data, usage: r.usage };
    });
    return { stage: 'question' as const, ...q };
  }
  const { system, prompt } = P.interviewEvalPrompt(input.mode, input.role, input.question ?? '', input.answer);
  const evaluation = await run(userId, 'interview', requestId, async (p) => {
    const r = await p.generateJson({ system, prompt, jsonSchema: INTERVIEW_EVAL_JSON_SCHEMA, maxOutputTokens: 1600 });
    const parsed = InterviewEvalSchema.safeParse(r.data);
    if (!parsed.success) throw new AIProviderError('invalid_output', 'Interview evaluation failed validation');
    return { value: parsed.data, usage: r.usage };
  });
  return {
    stage: 'feedback' as const,
    ...evaluation,
    isEstimate: true,
    disclaimer: 'AI feedback is an estimate to help you practise, not an official assessment.',
  };
}

// ---------- Conversations ----------

export async function listConversations(userId: Types.ObjectId, page: number, limit: number) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    AIConversation.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AIConversation.countDocuments(filter),
  ]);
  return {
    total,
    items: items.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      mode: c.mode,
      language: c.language,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      lessonId: c.context?.lessonId?.toString() ?? null,
    })),
  };
}

export async function getConversation(userId: Types.ObjectId, conversationId: Types.ObjectId, page: number, limit: number) {
  const convo = await AIConversation.findOne({ _id: conversationId, userId }).lean();
  if (!convo) throw notFound('Conversation');
  const total = await AIMessage.countDocuments({ conversationId, userId });
  // Page 1 = most recent messages; returned in chronological order.
  const messages = await AIMessage.find({ conversationId, userId })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    total,
    conversation: {
      id: convo._id.toString(),
      title: convo.title,
      mode: convo.mode,
      language: convo.language,
      lessonId: convo.context?.lessonId?.toString() ?? null,
      scenario: convo.context?.scenario ?? null,
    },
    messages: messages.reverse().map((m) => ({ id: m._id.toString(), role: m.role, content: m.content, createdAt: m.createdAt })),
  };
}

export async function deleteConversation(userId: Types.ObjectId, conversationId: Types.ObjectId) {
  const res = await AIConversation.deleteOne({ _id: conversationId, userId });
  if (!res.deletedCount) throw notFound('Conversation');
  await AIMessage.deleteMany({ conversationId, userId });
}
