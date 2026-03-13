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
 * Server-side: get current date from a NextRequest's cookies.
 * Use in API route handlers: getServerCurrentDate(req)
 */
export function getServerCurrentDate(req: { cookies: { get: (name: string) => { value: string } | undefined } }): Date {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return new Date();

  return buildOverrideDate(cookie.value) ?? new Date();
}

/** Cookie name export for the context provider */
export { COOKIE_NAME as DEV_DATE_COOKIE };
