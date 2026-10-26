import { describe, expect, it } from 'vitest';
import { addDays, dayKey, diffDays, weekKey } from '../src/lib/dates';
import { regenerate } from '../src/modules/gamification/hearts';
import { levelForXp, levelProgress, xpForLevel } from '../src/modules/gamification/levels';
import { applyActivity, effectiveStreak, streakAtRisk } from '../src/modules/gamification/streak';
import { checkAnswer, InvalidAnswerError, validateAnswerKey } from '../src/modules/lessons/answerChecker';
import { schedule } from '../src/modules/revision/srs';
import { StudyPlanSchema, validateQuiz } from '../src/modules/ai/schemas';
import { COURSES, validateContent } from '../src/seed/seed';

describe('answer checker', () => {
  it('multiple choice checks index and rejects out-of-range answers', () => {
    const data = { options: ['a', 'b', 'c'] };
    expect(checkAnswer('multiple_choice', { index: 1 }, data, 1)).toEqual({ correct: true, correctAnswer: 'b' });
    expect(checkAnswer('multiple_choice', { index: 1 }, data, 0).correct).toBe(false);
    expect(() => checkAnswer('multiple_choice', { index: 1 }, data, 7)).toThrow(InvalidAnswerError);
    expect(() => checkAnswer('multiple_choice', { index: 1 }, data, '1')).toThrow(InvalidAnswerError);
  });

  it('fill blank is case, whitespace and punctuation insensitive', () => {
    expect(checkAnswer('fill_blank', { accepted: ["They're"] }, {}, "  they’re. ").correct).toBe(true);
    expect(checkAnswer('fill_blank', { accepted: ['on'] }, {}, 'in').correct).toBe(false);
  });

  it('word order requires exact sequence', () => {
    const key = { order: ['I', 'am', 'here'] };
    const data = { words: ['here', 'I', 'am', 'is'] };
    expect(checkAnswer('word_order', key, data, ['I', 'am', 'here']).correct).toBe(true);
    expect(checkAnswer('word_order', key, data, ['am', 'I', 'here']).correct).toBe(false);
    expect(checkAnswer('word_order', key, data, ['I', 'am']).correct).toBe(false);
  });

  it('match pairs compares the full mapping', () => {
    const data = { left: ['a', 'b'], right: ['B', 'A'] };
    expect(checkAnswer('match_pairs', { mapping: [1, 0] }, data, [1, 0]).correct).toBe(true);
    expect(checkAnswer('match_pairs', { mapping: [1, 0] }, data, [0, 1]).correct).toBe(false);
    expect(() => checkAnswer('match_pairs', { mapping: [1, 0] }, data, [1])).toThrow(InvalidAnswerError);
  });

  it('code output normalises trailing whitespace but keeps line structure', () => {
    const key = { accepted: ['2\n5\n8'] };
    expect(checkAnswer('code_output', key, {}, '2  \n5\n8\n').correct).toBe(true);
    expect(checkAnswer('code_output', key, {}, '2 5 8').correct).toBe(false);
  });

  it('code fill ignores whitespace and quote style; never executes code', () => {
    expect(checkAnswer('code_fill', { accepted: ['+='] }, {}, ' += ').correct).toBe(true);
    expect(checkAnswer('code_fill', { accepted: ["print('x')"] }, {}, 'print("x")').correct).toBe(true);
    expect(checkAnswer('code_fill', { accepted: ['len'] }, {}, 'require("child_process").exec("rm -rf /")').correct).toBe(false);
  });

  it('short answer supports keyword rubrics', () => {
    const key = { keywords: ['who', 'allowed'], minKeywords: 2 };
    expect(checkAnswer('short_answer', key, {}, 'Authn is who you are; authz is what you are allowed to do').correct).toBe(true);
    expect(checkAnswer('short_answer', key, {}, 'it is about who you are').correct).toBe(false);
  });

  it('flashcards are self-graded and true/false needs a boolean', () => {
    expect(checkAnswer('flashcard', { selfGraded: true }, { back: 'x' }, { knew: true }).correct).toBe(true);
    expect(() => checkAnswer('true_false', { value: true }, {}, 'true')).toThrow(InvalidAnswerError);
  });

  it('validates authoring keys', () => {
    expect(validateAnswerKey('multiple_choice', { index: 3 }, { options: ['a', 'b'] })).toMatch(/out of range/);
    expect(validateAnswerKey('word_order', { order: ['x'] }, { words: ['y'] })).toMatch(/missing/);
    expect(validateAnswerKey('match_pairs', { mapping: [0, 0] }, { left: ['a', 'b'], right: ['c', 'd'] })).toMatch(/permutation/);
  });

  it('all seed content passes validation', () => {
    expect(validateContent(COURSES)).toEqual([]);
    expect(COURSES).toHaveLength(10);
  });
});

describe('streaks (timezone day keys)', () => {
  it('computes day keys in the learner timezone', () => {
    const t = new Date('2026-10-26T19:00:00Z'); // 00:30 next day in IST
    expect(dayKey(t, 'Asia/Kolkata')).toBe('2026-10-27');
    expect(dayKey(t, 'America/New_York')).toBe('2026-10-26');
  });

  it('increments on consecutive days, ignores same day, resets after a gap', () => {
    let s = applyActivity({ currentStreak: 0, longestStreak: 0, lastActiveDay: null }, '2026-01-01');
    expect(s.currentStreak).toBe(1);
    s = applyActivity(s, '2026-01-01');
    expect(s.currentStreak).toBe(1);
    s = applyActivity(s, '2026-01-02');
    s = applyActivity(s, '2026-01-03');
    expect(s).toMatchObject({ currentStreak: 3, longestStreak: 3 });
    s = applyActivity(s, '2026-01-06');
    expect(s).toMatchObject({ currentStreak: 1, longestStreak: 3 });
  });

  it('handles month/year boundaries and leap days', () => {
    let s = applyActivity({ currentStreak: 4, longestStreak: 4, lastActiveDay: '2027-12-31' }, '2028-01-01');
    expect(s.currentStreak).toBe(5);
    s = applyActivity({ currentStreak: 2, longestStreak: 2, lastActiveDay: '2028-02-28' }, '2028-02-29');
    expect(s.currentStreak).toBe(3);
    expect(diffDays('2028-03-01', '2028-02-28')).toBe(2);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('shows a broken streak as 0 and flags at-risk streaks', () => {
    const state = { currentStreak: 5, longestStreak: 9, lastActiveDay: '2026-03-10' };
    expect(effectiveStreak(state, '2026-03-10')).toBe(5);
    expect(effectiveStreak(state, '2026-03-11')).toBe(5);
    expect(streakAtRisk(state, '2026-03-11')).toBe(true);
    expect(effectiveStreak(state, '2026-03-12')).toBe(0);
  });

  it('ignores activity dated before the last active day', () => {
    const s = { currentStreak: 3, longestStreak: 3, lastActiveDay: '2026-05-05' };
    expect(applyActivity(s, '2026-05-04')).toEqual(s);
  });

  it('builds ISO week keys', () => {
    expect(weekKey('2026-01-01')).toBe('2026-W01');
    expect(weekKey('2027-01-01')).toBe('2026-W53');
  });
});

describe('levels and hearts', () => {
  it('maps XP to levels', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    for (let l = 1; l < 40; l++) expect(levelForXp(xpForLevel(l))).toBe(l);
    expect(levelProgress(150)).toMatchObject({ level: 2, currentLevelXp: 50, nextLevelXp: 200, xpToNextLevel: 150 });
  });

  it('regenerates hearts over time and keeps partial progress', () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const later = new Date('2026-01-01T11:10:00Z'); // 70 minutes
    const r = regenerate({ hearts: 1, heartsUpdatedAt: t0 }, later, 5, 30);
    expect(r.hearts).toBe(3);
    expect(r.heartsUpdatedAt.toISOString()).toBe('2026-01-01T11:00:00.000Z');
    expect(regenerate({ hearts: 4, heartsUpdatedAt: t0 }, new Date('2026-01-02T00:00:00Z'), 5, 30).hearts).toBe(5);
  });
});

describe('spaced repetition', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('grows intervals on success and resets on failure', () => {
    let s = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
    let r = schedule(s, 'correct', now);
    expect(r.intervalDays).toBe(1);
    s = r;
    r = schedule(s, 'correct', now);
    expect(r.intervalDays).toBe(3);
    s = r;
    r = schedule(s, 'correct', now);
    expect(r.intervalDays).toBeGreaterThan(3);
    const w = schedule(r, 'wrong', now);
    expect(w).toMatchObject({ intervalDays: 0, reps: 0, lapses: 1 });
    expect(w.ease).toBeLessThan(r.ease);
    expect(w.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('never lets ease fall below 1.3 and marks long intervals as mastered', () => {
    let s = { ease: 1.35, intervalDays: 0, reps: 0, lapses: 0 };
    s = schedule(s, 'wrong', now);
    expect(s.ease).toBe(1.3);
    const m = schedule({ ease: 2.5, intervalDays: 10, reps: 4, lapses: 0 }, 'correct', now);
    expect(m.mastered).toBe(true);
  });
});

describe('AI output validation', () => {
  const good = (o: Partial<Record<string, unknown>> = {}) => ({
    type: 'multiple_choice',
    question: 'What does const declare?',
    options: ['A constant binding', 'A loop', 'A function', 'A class'],
    correctAnswer: 0,
    explanation: 'const declares a binding that cannot be reassigned.',
    ...o,
  });

  it('accepts a valid quiz', () => {
    const r = validateQuiz({ title: 'JS', questions: [good(), good({ question: 'Q2 is here?' }), good({ question: 'Q3 is here?' })] }, 3);
    expect(r.ok).toBe(true);
    expect(r.valid).toHaveLength(3);
  });

  it('rejects malformed questions individually', () => {
    const r = validateQuiz(
      {
        title: 'JS',
        questions: [
          good(),
          good({ question: 'Out of range?', correctAnswer: 9 }),
          good({ question: 'Duplicate options?', options: ['a', 'a', 'b', 'c'] }),
          good({ question: 'Missing explanation?', explanation: '' }),
          good({ type: 'essay', question: 'Wrong type?' }),
          good(), // duplicate question text
          good({ question: 'Fine one?' }),
        ],
      },
      5,
    );
    expect(r.rejected).toBe(5);
    expect(r.valid).toHaveLength(2);
    expect(r.ok).toBe(false);
  });

  it('normalises true/false ordering and remaps the answer', () => {
    const r = validateQuiz(
      { title: 'TF', questions: [{ type: 'true_false', question: 'The sky is green?', options: ['False', 'True'], correctAnswer: 0, explanation: 'It is blue.' }] },
      1,
    );
    expect(r.valid[0]).toMatchObject({ options: ['True', 'False'], correctAnswer: 1 });
  });

  it('rejects non-object output entirely', () => {
    expect(validateQuiz('not json', 3).ok).toBe(false);
    expect(validateQuiz({ questions: 'x' }, 3).ok).toBe(false);
  });

  it('validates study plans', () => {
    expect(StudyPlanSchema.safeParse({ summary: 'x', focusTopics: [], days: [{ day: 1, title: 'a', tasks: [{ type: 'lesson', description: 'd' }] }] }).success).toBe(true);
    expect(StudyPlanSchema.safeParse({ summary: 'x', focusTopics: [], days: [{ day: 1, title: 'a', tasks: [{ type: 'hack', description: 'd' }] }] }).success).toBe(false);
  });
});
