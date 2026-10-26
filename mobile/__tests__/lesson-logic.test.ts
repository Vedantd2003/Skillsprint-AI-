import type { Question, SubmitResponse } from '../src/api/types';
import { emptyDraft, isReady, pickPair, toAnswer } from '../src/lesson/answers';
import { initialLessonState, lessonReducer, pendingSyncCount, progressOf } from '../src/lesson/lessonMachine';

const q = (id: string, type: Question['type'], data: Question['data'] = {}): Question => ({
  id,
  type,
  prompt: `Prompt ${id}`,
  instructions: '',
  data,
  topic: 'Topic',
  difficulty: 1,
});

const questions = [
  q('q1', 'multiple_choice', { options: ['a', 'b'] }),
  q('q2', 'true_false'),
  q('q3', 'fill_blank', { sentence: '___' }),
];

const response = (correct: boolean, hearts: number | null = 5): SubmitResponse => ({
  correct,
  skipped: false,
  alreadyAnswered: false,
  correctAnswer: 'b',
  explanation: 'Because.',
  hearts,
  progress: { answered: 1, total: 3 },
});

describe('lesson progression state machine', () => {
  it('walks answer → feedback → next → finished', () => {
    let s = lessonReducer(initialLessonState, { type: 'load', questions, answered: [], hearts: 5 });
    expect(s).toMatchObject({ index: 0, phase: 'answering' });

    s = lessonReducer(s, { type: 'check' });
    expect(s.phase).toBe('checking');
    s = lessonReducer(s, { type: 'result', questionId: 'q1', response: response(false, 4) });
    expect(s).toMatchObject({ phase: 'feedback', hearts: 4 });
    expect(progressOf(s)).toBeCloseTo(1 / 3);

    s = lessonReducer(s, { type: 'next' });
    expect(s).toMatchObject({ index: 1, phase: 'answering', feedback: null });

    s = lessonReducer(lessonReducer(s, { type: 'check' }), { type: 'result', questionId: 'q2', response: response(true) });
    s = lessonReducer(s, { type: 'next' });
    s = lessonReducer(lessonReducer(s, { type: 'check' }), { type: 'result', questionId: 'q3', response: response(true) });
    s = lessonReducer(s, { type: 'next' });
    expect(s.phase).toBe('finished');
    expect(progressOf(s)).toBe(1);
  });

  it('resumes at the first unanswered question', () => {
    const s = lessonReducer(initialLessonState, {
      type: 'load',
      questions,
      answered: [{ questionId: 'q1', correct: true, skipped: false }],
      hearts: null,
    });
    expect(s.index).toBe(1);
  });

  it('marks a fully answered attempt as finished on load', () => {
    const s = lessonReducer(initialLessonState, {
      type: 'load',
      questions,
      answered: questions.map((x) => ({ questionId: x.id, correct: true, skipped: false })),
      hearts: null,
    });
    expect(s.phase).toBe('finished');
  });

  it('distinguishes answers saved offline from synced ones', () => {
    let s = lessonReducer(initialLessonState, { type: 'load', questions, answered: [], hearts: 5 });
    s = lessonReducer(lessonReducer(s, { type: 'check' }), { type: 'savedOffline', questionId: 'q1' });
    expect(s.phase).toBe('savedOffline');
    expect(pendingSyncCount(s)).toBe(1);
    s = lessonReducer(s, { type: 'next' });
    expect(s.index).toBe(1);
  });

  it('stops on out-of-hearts and recovers from errors', () => {
    let s = lessonReducer(initialLessonState, { type: 'load', questions, answered: [], hearts: 1 });
    s = lessonReducer(lessonReducer(s, { type: 'check' }), { type: 'error', message: 'Server hiccup' });
    expect(s).toMatchObject({ phase: 'answering', error: 'Server hiccup' });
    s = lessonReducer(lessonReducer(s, { type: 'check' }), { type: 'outOfHearts' });
    expect(s).toMatchObject({ phase: 'outOfHearts', hearts: 0 });
    expect(lessonReducer(s, { type: 'next' })).toBe(s);
  });

  it('ignores a double check while one is in flight', () => {
    let s = lessonReducer(initialLessonState, { type: 'load', questions, answered: [], hearts: 5 });
    s = lessonReducer(s, { type: 'check' });
    expect(lessonReducer(s, { type: 'check' })).toBe(s);
  });
});

describe('answer drafts', () => {
  it('builds the payload each question type expects', () => {
    expect(toAnswer(questions[0]!, { kind: 'index', value: 1 })).toBe(1);
    expect(toAnswer(questions[1]!, { kind: 'bool', value: false })).toBe(false);
    expect(toAnswer(questions[2]!, { kind: 'text', value: '  on  ' })).toBe('on');
    const order = q('o', 'word_order', { words: ['I', 'am', 'am', 'here'] });
    expect(toAnswer(order, { kind: 'order', value: [0, 2, 3] })).toEqual(['I', 'am', 'here']);
    const code = q('c', 'code_output', { code: 'x' });
    expect(toAnswer(code, { kind: 'text', value: '2\n5\n8\n\n' })).toBe('2\n5\n8');
    expect(toAnswer(q('f', 'flashcard'), { kind: 'flash', flipped: true, value: true })).toEqual({ knew: true });
  });

  it('knows when an answer is ready to check', () => {
    expect(isReady(questions[0]!, emptyDraft(questions[0]!))).toBe(false);
    expect(isReady(questions[0]!, { kind: 'index', value: 0 })).toBe(true);
    expect(isReady(questions[2]!, { kind: 'text', value: '   ' })).toBe(false);
    const m = q('m', 'match_pairs', { left: ['a', 'b'], right: ['x', 'y'] });
    expect(isReady(m, { kind: 'pairs', value: [0, null], activeLeft: 1 })).toBe(false);
    expect(isReady(m, { kind: 'pairs', value: [0, 1], activeLeft: null })).toBe(true);
  });

  it('matches pairs by tapping left then right, reassigning when needed', () => {
    const m = q('m', 'match_pairs', { left: ['a', 'b', 'c'], right: ['x', 'y', 'z'] });
    let d = emptyDraft(m) as Extract<ReturnType<typeof emptyDraft>, { kind: 'pairs' }>;
    d = pickPair(d, 'right', 0); // nothing selected yet → no-op
    expect(d.value).toEqual([null, null, null]);
    d = pickPair(d, 'left', 0);
    d = pickPair(d, 'right', 2);
    expect(d.value).toEqual([2, null, null]);
    expect(d.activeLeft).toBe(1); // next unmatched pre-selected
    d = pickPair(d, 'left', 1); // tapping the pre-selected item keeps it selected
    expect(d.activeLeft).toBe(1);
    d = pickPair(d, 'right', 2); // steal z from a
    expect(d.value).toEqual([null, 2, null]);
    expect(d.activeLeft).toBe(0);
  });
});
