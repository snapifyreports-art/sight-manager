/**
 * Dev Mode Date Override Utility
 *
 * Provides getCurrentDate() for client-side and getServerCurrentDate() for
 * server-side API routes. When the "dev-date-override" cookie is set, these
 * return a Date with the overridden year/month/day but the real time-of-day.
 * When no cookie is set, they return new Date() (zero overhead).
 */

const COOKIE_NAME = "dev-date-override";

/**
 * Build a Date that has the overridden calendar date but today's real time.
 */
function buildOverrideDate(isoDate: string): Date | null {
  const parsed = new Date(isoDate + "T00:00:00");
  if (isNaN(parsed.getTime())) return null;

  const now = new Date();
  parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return parsed;
}

/**
 * Client-side: get current date (reads from document.cookie).
 * Safe to call from any client component or utility.
 */
export function getCurrentDate(): Date {
  if (typeof document === "undefined") return new Date();

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`)
  );
  if (!match?.[1]) return new Date();

  return buildOverrideDate(decodeURIComponent(match[1])) ?? new Date();
}

/**
 * "Today" snapped to midnight local time. Safe to use in render — avoids
 * hydration mismatches that would otherwise happen because the SSR render's
 * `new Date()` and the first client render's `new Date()` differ by a few
 * milliseconds. As long as SSR and hydration happen on the same calendar day
 * they produce identical values.
 *
 * Use this anywhere you write `const now = getCurrentDate()` at the top of a
 * client component that renders date-comparison logic.
 */
export function getCurrentDateAtMidnight(): Date {
  const d = getCurrentDate();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Server-side: get current date from a NextRequest's cookies.
 * Use in API route handlers: getServerCurrentDate(req)
 *
 * (May 2026 audit B-P1-35) Cron-secret-authenticated requests ignore
 * the dev-date cookie. Pre-fix anyone in possession of CRON_SECRET
 * could send a dev-date cookie alongside the cron auth header and
 * shift the cron's "today" to an arbitrary date — weaponising the
 * override to mark every overdue job not-overdue by setting
 * dev-date in 1900, for example.
 *
 * Session-authenticated requests keep dev-date working so Vercel
 * preview deployments and local dev are unaffected. The signal we
 * use is the Authorization header — cron routes always pass
 * `Bearer <CRON_SECRET>`; session routes never do (they use cookie
 * auth via NextAuth). If the caller doesn't expose `headers` (some
 * internal callers don't), we keep the legacy behaviour.
 */
export function getServerCurrentDate(req: {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers?: { get?: (name: string) => string | null };
}): Date {
  const authHeader = req.headers?.get?.("authorization") ?? null;
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    // Cron / API-token caller — never honour dev-date.
    return new Date();
  }
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return new Date();

  return buildOverrideDate(cookie.value) ?? new Date();
}

/**
 * (May 2026 audit #87) Server "start of today" snapped to UTC midnight.
 *
 * Why UTC: every Date Prisma writes is stored as UTC. When a cron asks
 * "jobs starting today", the boundary needs to match how those dates
 * were stored — i.e. UTC midnight. Local-timezone snap (`new Date(year,
 * month, day)`) only happens to do the right thing on Vercel because
 * the runtime is UTC; this helper makes the intent explicit and keeps
 * the boundary stable for any developer running cron handlers in a
 * non-UTC dev environment.
 *
 * Use this in cron handlers anywhere you need "today's calendar day"
 * for date-range queries against Prisma timestamps.
 */
export function getServerStartOfDay(
  req: { cookies: { get: (name: string) => { value: string } | undefined } },
): Date {
  const now = getServerCurrentDate(req);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Cookie name export for the context provider */
export { COOKIE_NAME as DEV_DATE_COOKIE };
