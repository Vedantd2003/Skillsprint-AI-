/**
 * Level curve: reaching level L requires 50·L·(L−1) total XP.
 *   L1: 0 · L2: 100 · L3: 300 · L4: 600 · L5: 1000 · L10: 4500
 */
export const LEVEL_STEP = 50;

export const xpForLevel = (level: number) => LEVEL_STEP * level * (level - 1);

export function levelForXp(xp: number): number {
  // Solve 50·L·(L−1) ≤ xp for the largest integer L.
  let level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / LEVEL_STEP)) / 2);
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return Math.max(1, level);
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, currentLevelXp: xp - floor, nextLevelXp: next - floor, xpToNextLevel: next - xp };
}
