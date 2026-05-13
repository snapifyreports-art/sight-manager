import { timingSafeEqual } from "crypto";

/**
 * Single source of truth for cron-endpoint auth.
 *
 * Pre-May 2026 the four cron routes each did `if (authHeader !==
 * \`Bearer ${process.env.CRON_SECRET}\`)`. Two problems with that:
 *   1. If CRON_SECRET was unset in production, a caller sending the
 *      literal string "Bearer undefined" passed the check.
 *   2. String equality leaks via timing.
 *
 * This helper hard-fails when the env var is empty in production,
 * uses constant-time comparison, and is the single check every
 * cron route calls.
 */
export function checkCronAuth(authHeader: string | null): { ok: boolean; reason?: string } {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) {
    if (process.env.NODE_ENV === "production") {
      // Refuse — means anyone can hit the endpoint otherwise.
      return { ok: false, reason: "CRON_SECRET is not set on the server" };
    }
    // (May 2026 audit B-P1-43) Pre-fix this fell through to "Bearer
    // dev-cron" whenever CRON_SECRET was empty AND NODE_ENV wasn't
    // strictly "production". Someone deploying via a non-Vercel path
    // (Docker, self-hosted Node) might end up with NODE_ENV=development
    // even in prod — and anyone hitting cron endpoints with "Bearer
    // dev-cron" could trigger lateness opens / cascade-reconcile /
    // weather alerts across the whole DB.
    //
    // Now: even in dev, require explicit opt-in via
    // ALLOW_DEV_CRON_FALLBACK=1. Local devs set it in .env.local; no
    // staging / prod ever has it.
    if (process.env.ALLOW_DEV_CRON_FALLBACK !== "1") {
      return {
        ok: false,
        reason:
          "CRON_SECRET is not set + ALLOW_DEV_CRON_FALLBACK not enabled — refusing",
      };
    }
    return { ok: authHeader === "Bearer dev-cron" };
  }

  const presented = authHeader ?? "";
  const target = `Bearer ${expected}`;
  if (presented.length !== target.length) return { ok: false };
  try {
    const a = Buffer.from(presented);
    const b = Buffer.from(target);
    return { ok: timingSafeEqual(a, b) };
  } catch {
    return { ok: false };
  }
}
