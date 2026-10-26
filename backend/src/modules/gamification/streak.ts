import { diffDays } from '../../lib/dates';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;
}

/**
 * Applies a qualifying learning activity on `today` (user-timezone day key).
 * - Same day: unchanged.
 * - Exactly the next day: streak + 1.
 * - Gap of 2+ days (or first ever activity): streak restarts at 1.
 * - Activity dated before lastActiveDay (clock skew / timezone change): ignored.
 */
export function applyActivity(state: StreakState, today: string): StreakState {
  if (!state.lastActiveDay) return { currentStreak: 1, longestStreak: Math.max(1, state.longestStreak), lastActiveDay: today };
  const gap = diffDays(today, state.lastActiveDay);
  if (gap <= 0) return state;
  const current = gap === 1 ? state.currentStreak + 1 : 1;
  return { currentStreak: current, longestStreak: Math.max(state.longestStreak, current), lastActiveDay: today };
}

/** Streak as displayed today: it's broken (0) once a full day has been missed. */
export function effectiveStreak(state: StreakState, today: string): number {
  if (!state.lastActiveDay) return 0;
  const gap = diffDays(today, state.lastActiveDay);
  return gap <= 1 ? state.currentStreak : 0;
}

/** True when the streak is alive but today's activity hasn't happened yet. */
export function streakAtRisk(state: StreakState, today: string): boolean {
  return Boolean(state.lastActiveDay) && diffDays(today, state.lastActiveDay!) === 1 && state.currentStreak > 0;
}
