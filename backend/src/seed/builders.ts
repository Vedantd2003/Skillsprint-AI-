import type { QuestionType } from '../models/content';

export interface QSpec {
  type: QuestionType;
  prompt: string;
  instructions?: string;
  data: Record<string, unknown>;
  answer: Record<string, unknown>;
  explanation: string;
  difficulty?: number;
  topic?: string;
}

export interface LessonSpec {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  kind?: 'lesson' | 'checkpoint' | 'review';
  xpReward?: number;
  questions: QSpec[];
}

export interface UnitSpec {
  slug: string;
  title: string;
  description: string;
  rewardXp?: number;
  lessons: LessonSpec[];
}

export interface CourseSpec {
  slug: string;
  title: string;
  category:
    | 'english_grammar'
    | 'english_communication'
    | 'python'
    | 'javascript_react'
    | 'fullstack'
    | 'ai_genai'
    | 'dsa'
    | 'aptitude'
    | 'interview'
    | 'professional';
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
  objectives: string[];
  color: string;
  icon: string;
  tracks: string[];
  units: UnitSpec[];
}

/** Deterministic shuffle (seeded by text) so seeds are reproducible but not in answer order. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  // Avoid accidentally leaving the original order.
  if (out.length > 1 && out.every((v, i) => v === items[i])) out.push(out.shift()!);
  return out;
}

export const mc = (prompt: string, options: string[], correct: number, explanation: string, difficulty = 1): QSpec => ({
  type: 'multiple_choice',
  prompt,
  instructions: 'Choose the correct answer',
  data: { options },
  answer: { index: correct },
  explanation,
  difficulty,
});

export const tf = (statement: string, value: boolean, explanation: string, difficulty = 1): QSpec => ({
  type: 'true_false',
  prompt: statement,
  instructions: 'True or false?',
  data: {},
  answer: { value },
  explanation,
  difficulty,
});

/** Fill in the blank: use ___ in the sentence. Optional word bank makes it tap-to-fill. */
export const fill = (sentence: string, accepted: string[], explanation: string, wordBank?: string[], difficulty = 1): QSpec => ({
  type: 'fill_blank',
  prompt: sentence,
  instructions: wordBank ? 'Tap the word that fills the blank' : 'Type the missing word',
  data: { sentence, ...(wordBank ? { wordBank: seededShuffle(wordBank, sentence) } : {}) },
  answer: { accepted },
  explanation,
  difficulty,
});

export const order = (prompt: string, words: string[], explanation: string, distractors: string[] = [], difficulty = 1): QSpec => ({
  type: 'word_order',
  prompt,
  instructions: 'Tap the words in the correct order',
  data: { words: seededShuffle([...words, ...distractors], prompt + words.join()) },
  answer: { order: words },
  explanation,
  difficulty,
});

export const match = (prompt: string, pairs: [string, string][], explanation: string, difficulty = 1): QSpec => {
  const left = pairs.map((p) => p[0]);
  const rightOriginal = pairs.map((p) => p[1]);
  const right = seededShuffle(rightOriginal, prompt);
  return {
    type: 'match_pairs',
    prompt,
    instructions: 'Match each item on the left with its pair',
    data: { left, right },
    answer: { mapping: rightOriginal.map((r) => right.indexOf(r)) },
    explanation,
    difficulty,
  };
};

export const flash = (front: string, back: string, explanation: string): QSpec => ({
  type: 'flashcard',
  prompt: 'Do you know this?',
  instructions: 'Think of the answer, flip the card, then be honest!',
  data: { front, back },
  answer: { selfGraded: true },
  explanation,
});

export const short = (
  prompt: string,
  key: { accepted?: string[]; keywords?: string[]; minKeywords?: number },
  explanation: string,
  placeholder = 'Type your answer',
  difficulty = 2,
): QSpec => ({
  type: 'short_answer',
  prompt,
  instructions: 'Write a short answer',
  data: { placeholder },
  answer: { ...key },
  explanation,
  difficulty,
});

export const out = (prompt: string, code: string, language: string, accepted: string[], explanation: string, difficulty = 2): QSpec => ({
  type: 'code_output',
  prompt,
  instructions: 'Predict the exact output',
  data: { code, language },
  answer: { accepted },
  explanation,
  difficulty,
});

/** Code fill / debugging: code contains ____ where the fix goes. Options make it tappable on mobile. */
export const cfill = (prompt: string, code: string, language: string, accepted: string[], explanation: string, options?: string[], difficulty = 2): QSpec => ({
  type: 'code_fill',
  prompt,
  instructions: options ? 'Pick the code that fixes the blank' : 'Type the missing code',
  data: { code, language, ...(options ? { options: seededShuffle(options, code) } : {}) },
  answer: { accepted },
  explanation,
  difficulty,
});
