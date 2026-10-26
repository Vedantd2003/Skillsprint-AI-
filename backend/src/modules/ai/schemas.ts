import { z } from 'zod';

// ---------- Quiz ----------

export const QUIZ_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'true_false'] },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctAnswer: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['type', 'question', 'options', 'correctAnswer', 'explanation'],
      },
    },
  },
  required: ['title', 'questions'],
} as const;

const RawQuiz = z.object({
  title: z.string().trim().min(1).max(160),
  questions: z.array(z.unknown()).min(1).max(30),
});

const RawQuestion = z.object({
  type: z.enum(['multiple_choice', 'true_false']),
  question: z.string().trim().min(5).max(600),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  correctAnswer: z.number().int(),
  explanation: z.string().trim().min(5).max(800),
});

export interface ValidQuizQuestion {
  type: 'multiple_choice' | 'true_false';
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

/**
 * Validates model output question-by-question. Malformed questions are
 * rejected (not repaired by guessing). Deterministic checks:
 * schema shape, unique non-empty options, answer index in range, true/false
 * options normalised, duplicate questions removed.
 */
export function validateQuiz(raw: unknown, requested: number) {
  const parsed = RawQuiz.safeParse(raw);
  if (!parsed.success) return { ok: false as const, reason: 'schema', valid: [] as ValidQuizQuestion[], rejected: 0 };
  const valid: ValidQuizQuestion[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const item of parsed.data.questions) {
    const q = RawQuestion.safeParse(item);
    if (!q.success) {
      rejected++;
      continue;
    }
    let { options } = q.data;
    const { type, correctAnswer } = q.data;
    if (type === 'true_false') {
      const norm = options.map((o) => o.toLowerCase());
      if (options.length !== 2 || !norm.includes('true') || !norm.includes('false')) {
        rejected++;
        continue;
      }
      // Normalise order to [True, False] and remap the answer index.
      const correctIsTrue = norm[correctAnswer] === 'true';
      if (correctAnswer < 0 || correctAnswer > 1) {
        rejected++;
        continue;
      }
      options = ['True', 'False'];
      q.data.correctAnswer = correctIsTrue ? 0 : 1;
    } else if (options.length < 3) {
      rejected++;
      continue;
    }
    const lowered = options.map((o) => o.toLowerCase());
    if (new Set(lowered).size !== options.length) {
      rejected++;
      continue;
    }
    if (q.data.correctAnswer < 0 || q.data.correctAnswer >= options.length) {
      rejected++;
      continue;
    }
    const dedupeKey = q.data.question.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(dedupeKey)) {
      rejected++;
      continue;
    }
    seen.add(dedupeKey);
    valid.push({ type, question: q.data.question, options, correctAnswer: q.data.correctAnswer, explanation: q.data.explanation });
  }
  const minimum = Math.min(requested, Math.max(2, Math.ceil(requested * 0.6)));
  return {
    ok: valid.length >= minimum,
    reason: valid.length >= minimum ? null : 'too_few_valid',
    title: parsed.data.title,
    valid: valid.slice(0, requested),
    rejected,
  };
}

// ---------- Study plan ----------

export const STUDY_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    focusTopics: { type: 'array', items: { type: 'string' } },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          title: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['lesson', 'revision', 'tutor', 'quiz'] },
                description: { type: 'string' },
                lessonId: { type: 'string' },
                topic: { type: 'string' },
              },
              required: ['type', 'description'],
            },
          },
        },
        required: ['day', 'title', 'tasks'],
      },
    },
  },
  required: ['summary', 'focusTopics', 'days'],
} as const;

export const StudyPlanSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  focusTopics: z.array(z.string().trim().min(1).max(80)).max(8),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(14),
        title: z.string().trim().min(1).max(100),
        tasks: z
          .array(
            z.object({
              type: z.enum(['lesson', 'revision', 'tutor', 'quiz']),
              description: z.string().trim().min(1).max(240),
              lessonId: z.string().optional(),
              topic: z.string().max(80).optional(),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(14),
});

// ---------- Interview ----------

export const INTERVIEW_QUESTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    focus: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
  },
  required: ['question', 'focus', 'tips'],
} as const;

export const InterviewQuestionSchema = z.object({
  question: z.string().trim().min(5).max(500),
  focus: z.string().trim().min(1).max(100),
  tips: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
});

export const INTERVIEW_EVAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        structure: { type: 'integer' },
        clarity: { type: 'integer' },
        relevance: { type: 'integer' },
        depth: { type: 'integer' },
      },
      required: ['structure', 'clarity', 'relevance', 'depth'],
    },
    overall: { type: 'integer' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    improvedAnswer: { type: 'string' },
    followUpQuestion: { type: 'string' },
  },
  required: ['scores', 'overall', 'strengths', 'improvements', 'improvedAnswer', 'followUpQuestion'],
} as const;

const Score5 = z.number().int().min(1).max(5);
export const InterviewEvalSchema = z.object({
  scores: z.object({ structure: Score5, clarity: Score5, relevance: Score5, depth: Score5 }),
  overall: z.number().int().min(1).max(10),
  strengths: z.array(z.string().trim().min(1).max(300)).max(5),
  improvements: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
  improvedAnswer: z.string().trim().min(1).max(2500),
  followUpQuestion: z.string().trim().max(400),
});
