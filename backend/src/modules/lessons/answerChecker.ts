/**
 * Deterministic, server-side answer checking for every curated question type.
 *
 * Answer-key shapes (stored in Question.answer, never sent before submission):
 *   multiple_choice  { index: number }                      given: number
 *   true_false       { value: boolean }                     given: boolean
 *   fill_blank       { accepted: string[] }                 given: string
 *   word_order       { order: string[] }                    given: string[]
 *   match_pairs      { mapping: number[] }  left i -> right mapping[i]   given: number[]
 *   flashcard        { selfGraded: true }                   given: { knew: boolean }
 *   short_answer     { accepted?: string[]; keywords?: string[]; minKeywords?: number }  given: string
 *   code_output      { accepted: string[] }                 given: string (whitespace-normalised)
 *   code_fill        { accepted: string[] }                 given: string (whitespace-insensitive)
 *
 * Code questions are graded by comparing text only — user code is never executed.
 */
import type { QuestionType } from '../../models/content';

export interface CheckResult {
  correct: boolean;
  /** Human-readable correct answer to show after submission. */
  correctAnswer: string;
}

type Key = Record<string, unknown>;
type Data = Record<string, unknown>;

const normText = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normCodeOutput = (s: string) =>
  s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

const normCodeToken = (s: string) => s.replace(/\s+/g, '').replace(/["]/g, "'");

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export class InvalidAnswerError extends Error {}

export function checkAnswer(type: QuestionType, key: Key, data: Data, given: unknown): CheckResult {
  switch (type) {
    case 'multiple_choice': {
      const options = strArr(data.options);
      const idx = key.index as number;
      if (typeof given !== 'number' || !Number.isInteger(given) || given < 0 || given >= options.length) {
        throw new InvalidAnswerError('Answer must be an option index');
      }
      return { correct: given === idx, correctAnswer: options[idx] ?? '' };
    }
    case 'true_false': {
      if (typeof given !== 'boolean') throw new InvalidAnswerError('Answer must be true or false');
      return { correct: given === key.value, correctAnswer: key.value ? 'True' : 'False' };
    }
    case 'fill_blank': {
      if (typeof given !== 'string' || given.length > 300) throw new InvalidAnswerError('Answer must be text');
      const accepted = strArr(key.accepted);
      return { correct: accepted.some((a) => normText(a) === normText(given)), correctAnswer: accepted[0] ?? '' };
    }
    case 'word_order': {
      const order = strArr(key.order);
      const words = strArr(data.words);
      if (!Array.isArray(given) || given.some((w) => typeof w !== 'string') || given.length > words.length) {
        throw new InvalidAnswerError('Answer must be a list of words');
      }
      const correct = given.length === order.length && order.every((w, i) => normText(w) === normText(given[i] as string));
      return { correct, correctAnswer: order.join(' ') };
    }
    case 'match_pairs': {
      const mapping = (key.mapping as number[]) ?? [];
      const left = strArr(data.left);
      const right = strArr(data.right);
      if (
        !Array.isArray(given) ||
        given.length !== left.length ||
        given.some((g) => typeof g !== 'number' || !Number.isInteger(g) || g < 0 || g >= right.length)
      ) {
        throw new InvalidAnswerError('Answer must map every left item to a right item');
      }
      const correct = mapping.every((r, i) => given[i] === r);
      return { correct, correctAnswer: left.map((l, i) => `${l} → ${right[mapping[i] ?? 0]}`).join(', ') };
    }
    case 'flashcard': {
      if (typeof given !== 'object' || given === null || typeof (given as { knew?: unknown }).knew !== 'boolean') {
        throw new InvalidAnswerError('Answer must be { knew: boolean }');
      }
      return { correct: (given as { knew: boolean }).knew, correctAnswer: String(data.back ?? '') };
    }
    case 'short_answer': {
      if (typeof given !== 'string' || given.length > 1000) throw new InvalidAnswerError('Answer must be text');
      const n = normText(given);
      const accepted = strArr(key.accepted);
      const keywords = strArr(key.keywords);
      const exact = accepted.some((a) => normText(a) === n);
      const hits = keywords.filter((k) => n.includes(normText(k))).length;
      const min = typeof key.minKeywords === 'number' ? key.minKeywords : keywords.length;
      const byKeywords = keywords.length > 0 && hits >= min;
      return { correct: exact || byKeywords, correctAnswer: accepted[0] ?? keywords.join(', ') };
    }
    case 'code_output': {
      if (typeof given !== 'string' || given.length > 1000) throw new InvalidAnswerError('Answer must be text');
      const accepted = strArr(key.accepted);
      return {
        correct: accepted.some((a) => normCodeOutput(a) === normCodeOutput(given)),
        correctAnswer: accepted[0] ?? '',
      };
    }
    case 'code_fill': {
      if (typeof given !== 'string' || given.length > 300) throw new InvalidAnswerError('Answer must be text');
      const accepted = strArr(key.accepted);
      return {
        correct: accepted.some((a) => normCodeToken(a) === normCodeToken(given)),
        correctAnswer: accepted[0] ?? '',
      };
    }
    default: {
      const t: never = type;
      throw new InvalidAnswerError(`Unsupported question type ${String(t)}`);
    }
  }
}

/** Validates an answer key at authoring time (seed + admin). Returns an error message or null. */
export function validateAnswerKey(type: QuestionType, key: Key, data: Data): string | null {
  const options = strArr(data.options);
  switch (type) {
    case 'multiple_choice':
      if (options.length < 2) return 'multiple_choice needs at least 2 options';
      if (new Set(options).size !== options.length) return 'options must be unique';
      if (typeof key.index !== 'number' || key.index < 0 || key.index >= options.length) return 'answer.index out of range';
      return null;
    case 'true_false':
      return typeof key.value === 'boolean' ? null : 'answer.value must be boolean';
    case 'fill_blank':
    case 'code_output':
    case 'code_fill':
      return strArr(key.accepted).length ? null : 'answer.accepted must be non-empty';
    case 'word_order': {
      const order = strArr(key.order);
      const words = strArr(data.words);
      if (!order.length) return 'answer.order must be non-empty';
      const pool = [...words];
      for (const w of order) {
        const i = pool.indexOf(w);
        if (i < 0) return `word "${w}" missing from data.words`;
        pool.splice(i, 1);
      }
      return null;
    }
    case 'match_pairs': {
      const left = strArr(data.left);
      const right = strArr(data.right);
      const mapping = key.mapping as unknown;
      if (!Array.isArray(mapping) || mapping.length !== left.length) return 'answer.mapping length must equal left';
      if (new Set(mapping).size !== mapping.length) return 'answer.mapping must be a permutation';
      if (mapping.some((m) => typeof m !== 'number' || m < 0 || m >= right.length)) return 'mapping out of range';
      return null;
    }
    case 'flashcard':
      return typeof data.front === 'string' && typeof data.back === 'string' ? null : 'flashcard needs data.front/back';
    case 'short_answer':
      return strArr(key.accepted).length || strArr(key.keywords).length ? null : 'short_answer needs accepted or keywords';
    default:
      return 'unknown type';
  }
}
