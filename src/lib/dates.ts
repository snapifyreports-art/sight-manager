/**
 * Date-key helpers for "day-scoped" dates.
 *
 * Problem: the app deals in calendar dates (start dates, delivery dates,
 * order dates) that the user perceives as "a day", not "an instant". If we
 * serialise them via `.toISOString().slice(0,10)` on a client in BST the
 * UTC conversion shifts midnight local back one hour → previous calendar
 * day. Smoke test Apr 2026 found Pull Forward storing Sun 26 Apr when the
 * user picked Mon 27 Apr.
 *
 * Solution: always round-trip day-scoped dates through a `YYYY-MM-DD`
 * string built from LOCAL calendar parts. Parse back as UTC-midnight so
 * the stored timestamp is stable under any server/user timezone.
 *
 * Use these anywhere a user-facing CALENDAR DATE crosses a wire:
 *   - Client → server:      toDateKey(localDate)
 *   - Server → DB:          fromDateKey(dateKey)  // Prisma stores UTC
 *   - Server → client JSON: toDateKey(stored)     // if the field is day-scoped
 *   - Render:               format(new Date(iso), "...") still works
 *                           because we're stable at UTC midnight.
 *
 * DO NOT use `.toISOString().slice(0,10)` on a local Date anywhere in
 * day-scoped code paths. Use toDateKey instead.
 */

/**
 * Format a Date's LOCAL calendar day as `YYYY-MM-DD`.
 *
 * Does not use `.toISOString()` — that returns UTC, and in BST the UTC
 * day is yesterday at local midnight. Read the local getters directly.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a `YYYY-MM-DD` key back into a Date at UTC midnight. The resulting
 * timestamp formats back to the same calendar day in every timezone that
 * Sight Manager is plausibly used in (UK: BST/GMT), because our date-fns
 * `format()` calls use local getters — local 00:00 in BST is 23:00 UTC the
 * previous day, but UTC 00:00 (what we store) is 01:00 BST of the intended
 * day, which formats correctly.
 */
export function fromDateKey(key: string): Date {
  // `new Date("YYYY-MM-DD")` is specced as UTC midnight — exactly what we want.
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Convert a stored Date (assumed UTC midnight) back into the YYYY-MM-DD
 * date key suitable for JSON / query params. Equivalent to toDateKey on the
 * UTC calendar parts — use when you explicitly want the UTC day, not the
 * reader's local day. Most callers should use `toDateKey(new Date(iso))`
 * for local, and this for storage-identity round-trips.
 */
export function toUtcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a server-supplied ISO string (typically UTC-midnight) into a
 * Date at LOCAL midnight of the SAME calendar day.
 *
 * Use this on the client before comparing server-returned dates to
 * `getCurrentDateAtMidnight()` via date-fns `isBefore` / `isAfter` /
 * `isSameDay` — those helpers compare timestamps, and a UTC-midnight
 * value in BST is 01:00 local (i.e. 1 hour later than local midnight),
 * which flips "today == earliest" into "today before earliest" and
 * wrongly blocks "Start today" as in the past.
 */
export function parseServerDateToLocal(iso: string): Date {
  const raw = new Date(iso);
  if (isNaN(raw.getTime())) return raw;
  return new Date(
    raw.getUTCFullYear(),
    raw.getUTCMonth(),
    raw.getUTCDate(),
  );
}
