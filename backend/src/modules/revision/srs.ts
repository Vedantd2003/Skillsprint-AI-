/**
 * Simplified SM-2 spaced repetition.
 * - Wrong: reps reset, ease −0.2 (min 1.3), due again in 10 minutes.
 * - Correct: interval 1d → 3d → interval × ease; ease +0.05 (max 3.0).
 * - Skipped: due again in 1 hour, counted separately.
 * An item counts as mastered once its interval reaches 21 days.
 */
export interface SrsState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export type SrsOutcome = 'correct' | 'wrong' | 'skipped';

export const MASTERED_INTERVAL_DAYS = 21;

export function schedule(state: SrsState, outcome: SrsOutcome, now: Date) {
  if (outcome === 'skipped') {
    return { ...state, dueAt: new Date(now.getTime() + 60 * 60_000), mastered: false };
  }
  if (outcome === 'wrong') {
    return {
      ease: Math.max(1.3, +(state.ease - 0.2).toFixed(2)),
      intervalDays: 0,
      reps: 0,
      lapses: state.lapses + 1,
      dueAt: new Date(now.getTime() + 10 * 60_000),
      mastered: false,
    };
  }
  const reps = state.reps + 1;
  const intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(1, state.intervalDays) * state.ease);
  return {
    ease: Math.min(3, +(state.ease + 0.05).toFixed(2)),
    intervalDays,
    reps,
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + intervalDays * 86_400_000),
    mastered: intervalDays >= MASTERED_INTERVAL_DAYS,
  };
}
