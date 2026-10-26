/**
 * Hearts: a wrong answer in a regular lesson costs one heart. Hearts refill
 * one every HEART_REFILL_MINUTES, and correct answers in revision practice
 * earn hearts back. Running out never erases progress: the in-progress
 * attempt is kept and resumes where the learner left off.
 */
export interface HeartsState {
  hearts: number;
  heartsUpdatedAt: Date;
}

export function regenerate(state: HeartsState, now: Date, max: number, refillMinutes: number): HeartsState {
  if (state.hearts >= max) return { hearts: max, heartsUpdatedAt: now };
  const elapsed = now.getTime() - new Date(state.heartsUpdatedAt).getTime();
  const gained = Math.floor(elapsed / (refillMinutes * 60_000));
  if (gained <= 0) return state;
  const hearts = Math.min(max, state.hearts + gained);
  // Keep the partial progress toward the next heart.
  const heartsUpdatedAt =
    hearts >= max ? now : new Date(new Date(state.heartsUpdatedAt).getTime() + gained * refillMinutes * 60_000);
  return { hearts, heartsUpdatedAt };
}

export function nextHeartAt(state: HeartsState, max: number, refillMinutes: number): Date | null {
  if (state.hearts >= max) return null;
  return new Date(new Date(state.heartsUpdatedAt).getTime() + refillMinutes * 60_000);
}
