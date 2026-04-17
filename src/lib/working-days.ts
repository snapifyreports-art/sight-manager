/**
 * Working Days Utility — Mon-Fri only
 *
 * ALL schedule shifts (cascade, delay, pull forward) use working days.
 * Job durations (end - start) remain as calendar days.
 * This is the single source of truth for working day calculations.
 */

/** Returns false for Saturday (6) and Sunday (0) */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Add N working days (Mon-Fri) to a date. Negative values go backwards.
 * If the start date is a weekend, snaps forward first.
 */
export function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  // Snap to working day first
  if (!isWorkingDay(result)) {
    if (days >= 0) {
      // Moving forward: snap to next Monday
      while (!isWorkingDay(result)) result.setDate(result.getDate() + 1);
    } else {
      // Moving backward: snap to previous Friday
      while (!isWorkingDay(result)) result.setDate(result.getDate() - 1);
    }
  }

  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (isWorkingDay(result)) {
      remaining--;
    }
  }

  return result;
}

/**
 * Count working days (Mon-Fri) between two dates.
 * Returns positive if dateA > dateB, negative if dateA < dateB.
 */
export function differenceInWorkingDays(dateA: Date, dateB: Date): number {
  const a = new Date(dateA);
  a.setHours(0, 0, 0, 0);
  const b = new Date(dateB);
  b.setHours(0, 0, 0, 0);

  if (a.getTime() === b.getTime()) return 0;

  const forward = a > b;
  const start = forward ? b : a;
  const end = forward ? a : b;

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) count++;
  }

  return forward ? count : -count;
}

/**
 * If date falls on a weekend, snap to nearest working day.
 * 'forward' → next Monday, 'back' → previous Friday.
 */
export function snapToWorkingDay(date: Date, direction: "forward" | "back"): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  if (isWorkingDay(result)) return result;

  if (direction === "forward") {
    while (!isWorkingDay(result)) result.setDate(result.getDate() + 1);
  } else {
    while (!isWorkingDay(result)) result.setDate(result.getDate() - 1);
  }

  return result;
}
