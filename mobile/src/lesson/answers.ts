import type { Answer, Question } from '../api/types';

/** Draft (in-progress) answer shapes held by the UI for each question type. */
export type Draft =
  | { kind: 'index'; value: number | null }
  | { kind: 'bool'; value: boolean | null }
  | { kind: 'text'; value: string }
  | { kind: 'order'; value: number[] } // indices into data.words (handles duplicate words)
  | { kind: 'pairs'; value: (number | null)[]; activeLeft: number | null }
  | { kind: 'flash'; flipped: boolean; value: boolean | null };

export function emptyDraft(q: Question): Draft {
  switch (q.type) {
    case 'multiple_choice':
      return { kind: 'index', value: null };
    case 'true_false':
      return { kind: 'bool', value: null };
    case 'word_order':
      return { kind: 'order', value: [] };
    case 'match_pairs':
      return { kind: 'pairs', value: (q.data.left ?? []).map(() => null), activeLeft: null };
    case 'flashcard':
      return { kind: 'flash', flipped: false, value: null };
    default:
      return { kind: 'text', value: '' };
  }
}

export function isReady(q: Question, d: Draft): boolean {
  switch (d.kind) {
    case 'index':
    case 'bool':
      return d.value !== null;
    case 'text':
      return d.value.trim().length > 0;
    case 'order':
      return d.value.length > 0;
    case 'pairs':
      return d.value.every((v) => v !== null);
    case 'flash':
      return d.value !== null;
  }
}

/** Converts a draft into the exact payload the API expects for the question type. */
export function toAnswer(q: Question, d: Draft): Answer {
  switch (d.kind) {
    case 'index':
      return d.value as number;
    case 'bool':
      return d.value as boolean;
    case 'text':
      return q.type === 'code_output' ? d.value.replace(/\s+$/g, '') : d.value.trim();
    case 'order':
      return d.value.map((i) => (q.data.words ?? [])[i] as string);
    case 'pairs':
      return d.value as number[];
    case 'flash':
      return { knew: Boolean(d.value) };
  }
}

/** Matching: tap a left item, then a right item. Tapping an assigned right item reassigns it. */
export function pickPair(d: Extract<Draft, { kind: 'pairs' }>, side: 'left' | 'right', index: number): Extract<Draft, { kind: 'pairs' }> {
  // Tapping a left item always selects it (the next unmatched one is pre-selected for speed).
  if (side === 'left') return { ...d, activeLeft: index };
  if (d.activeLeft === null) return d;
  const value = d.value.map((v) => (v === index ? null : v));
  value[d.activeLeft] = index;
  const nextLeft = value.findIndex((v) => v === null);
  return { kind: 'pairs', value, activeLeft: nextLeft === -1 ? null : nextLeft };
}
