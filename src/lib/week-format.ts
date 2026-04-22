/**
 * Display helpers for template week ranges.
 *
 * Two concerns this file handles:
 *
 * 1. Week 0 skip convention (construction industry). Raw offsets use
 *    contiguous integers — ..., -2, -1, 0, 1, 2 — but the display
 *    always jumps over 0 so the sequence reads ..., -2, -1, 1, 2, 3.
 *    `displayWeek` applies that transform for a single value; only
 *    matters for order anchor maths where offsets can legitimately be
 *    negative. Stage startWeek/endWeek are always ≥ 1 so the transform
 *    is a no-op there.
 *
 * 2. Range formatting. A 1-week stage stored as `{startWeek: 3, endWeek: 3}`
 *    used to render as "Wk 3-3", which reads oddly. Collapse to "Wk 3"
 *    for zero-length spans. For multi-week spans, use a hyphen rather
 *    than the en-dash — en-dashes at 10-11px render as two narrow
 *    strokes that are easy to misread as a double-hyphen (smoke test
 *    Apr 2026).
 */

/**
 * Map a stored week index to its Week-0-skipped display value.
 * - Week 0 is skipped, so anything ≤ 0 slides down by 1.
 * - 1 → 1, 2 → 2, ... (unchanged)
 * - 0 → -1 (pushed below the gap)
 * - -1 → -2, -2 → -3, ...
 */
export function displayWeek(rawWeek: number): number {
  return rawWeek <= 0 ? rawWeek - 1 : rawWeek;
}

/**
 * Format a week range for badge-style labels.
 *
 *   formatWeekRange(3, 3)  → "Wk 3"
 *   formatWeekRange(1, 5)  → "Wk 1-5"
 *   formatWeekRange(-2, 1) → "Wk -2 to 1" (after Week-0 skip: -3 to 1)
 *
 * `applyWeekZeroSkip`: pass true when the range is relative to a
 * template start (can legitimately straddle week 0). Leave false (the
 * default) for stage week badges where raw values are always ≥ 1.
 */
export function formatWeekRange(
  startWeek: number,
  endWeek: number,
  applyWeekZeroSkip = false,
): string {
  const start = applyWeekZeroSkip ? displayWeek(startWeek) : startWeek;
  const end = applyWeekZeroSkip ? displayWeek(endWeek) : endWeek;
  if (start === end) return `Wk ${start}`;
  return `Wk ${start}-${end}`;
}
