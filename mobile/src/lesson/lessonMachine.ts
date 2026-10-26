import type { Question, SubmitResponse } from '../api/types';

/**
 * Pure state machine for the lesson player, kept free of React and network
 * code so the flow (answer → feedback → next → finish) is easy to test.
 */
export type Phase = 'answering' | 'checking' | 'feedback' | 'savedOffline' | 'outOfHearts' | 'finished';

export interface LessonState {
  questions: Question[];
  index: number;
  phase: Phase;
  results: Record<string, { correct: boolean; skipped: boolean; synced: boolean }>;
  feedback: SubmitResponse | null;
  hearts: number | null;
  error: string | null;
}

export type LessonAction =
  | { type: 'load'; questions: Question[]; answered: { questionId: string; correct: boolean; skipped: boolean }[]; hearts: number | null }
  | { type: 'check' }
  | { type: 'result'; questionId: string; response: SubmitResponse }
  | { type: 'savedOffline'; questionId: string }
  | { type: 'outOfHearts' }
  | { type: 'error'; message: string }
  | { type: 'next' };

export const initialLessonState: LessonState = {
  questions: [],
  index: 0,
  phase: 'answering',
  results: {},
  feedback: null,
  hearts: null,
  error: null,
};

const firstUnanswered = (questions: Question[], results: LessonState['results']) => {
  const i = questions.findIndex((q) => !results[q.id]);
  return i === -1 ? questions.length : i;
};

export function lessonReducer(state: LessonState, action: LessonAction): LessonState {
  switch (action.type) {
    case 'load': {
      const results: LessonState['results'] = {};
      for (const a of action.answered) results[a.questionId] = { correct: a.correct, skipped: a.skipped, synced: true };
      const index = firstUnanswered(action.questions, results);
      return {
        ...initialLessonState,
        questions: action.questions,
        results,
        index,
        hearts: action.hearts,
        phase: index >= action.questions.length ? 'finished' : 'answering',
      };
    }
    case 'check':
      return state.phase === 'answering' ? { ...state, phase: 'checking', error: null } : state;
    case 'result':
      return {
        ...state,
        phase: 'feedback',
        feedback: action.response,
        hearts: action.response.hearts ?? state.hearts,
        results: {
          ...state.results,
          [action.questionId]: { correct: action.response.correct, skipped: action.response.skipped, synced: true },
        },
      };
    case 'savedOffline':
      return {
        ...state,
        phase: 'savedOffline',
        feedback: null,
        results: { ...state.results, [action.questionId]: { correct: false, skipped: false, synced: false } },
      };
    case 'outOfHearts':
      return { ...state, phase: 'outOfHearts', hearts: 0 };
    case 'error':
      return { ...state, phase: 'answering', error: action.message };
    case 'next': {
      if (state.phase !== 'feedback' && state.phase !== 'savedOffline') return state;
      const index = firstUnanswered(state.questions, state.results);
      return { ...state, index, feedback: null, phase: index >= state.questions.length ? 'finished' : 'answering' };
    }
    default:
      return state;
  }
}

export const progressOf = (s: LessonState) =>
  s.questions.length ? Object.keys(s.results).length / s.questions.length : 0;

export const pendingSyncCount = (s: LessonState) => Object.values(s.results).filter((r) => !r.synced).length;
