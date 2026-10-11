/** Exponential backoff with equal jitter (half fixed, half random). attempt starts at 1. */
export function backoffMs(attempt: number, baseMs: number, capMs: number, random: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}
