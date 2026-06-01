// Shared daily-bucketing helpers for usage aggregation.
//
// We render a 60-day sparkline. Both storage.mjs (live events) and history.mjs
// (backfill from history.jsonl + sessions) must bucket events into the same
// window using the same boundaries, so they live here and import from one place.

export const DAYS = 60;

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Returns 0..DAYS-1 (today = DAYS-1) or -1 if the timestamp falls outside the
// window. Computed against local-time midnight so day boundaries line up with
// the UI label "today / yesterday".
export function bucketDay(ts) {
  if (!ts) return -1;
  const start = startOfTodayMs();
  const diff = start - ts;
  if (diff < -MS_PER_DAY) return -1; // future events shouldn't happen but guard
  const daysAgo = Math.floor(diff / MS_PER_DAY);
  if (daysAgo < 0) return DAYS - 1; // events from "earlier today" still bucket as today
  if (daysAgo >= DAYS) return -1;
  return DAYS - 1 - daysAgo;
}

export function emptyDaily() {
  return new Array(DAYS).fill(0);
}

// Add b into a in place (a is the accumulator).
export function addDaily(a, b) {
  if (!b) return a;
  for (let i = 0; i < DAYS; i++) a[i] += (b[i] ?? 0);
  return a;
}
