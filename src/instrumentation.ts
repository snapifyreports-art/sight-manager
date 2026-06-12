/**
 * (Jun 2026 guardrail — Keith-approved) Start-up settings check.
 *
 * Why: a missing or placeholder env var fails SILENTLY mid-click — the
 * share-token 500s and the would-be-dead outbound email were both this
 * class. This runs ONCE at server boot and shouts a readable list into
 * the logs instead. It never crashes the app: a misconfigured deploy
 * that mostly works beats a total outage.
 *
 * Next.js runs register() on boot (src/instrumentation.ts is picked up
 * automatically). Node runtime only — the edge bundle lacks process.env
 * parity and none of these are read there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const errors: string[] = [];
  const warns: string[] = [];

  const get = (k: string) => process.env[k]?.trim() || "";

  // Hard requirements — the app malfunctions without these.
  if (!get("DATABASE_URL")) errors.push("DATABASE_URL is not set — Prisma cannot connect.");
  const secret = get("AUTH_SECRET") || get("NEXTAUTH_SECRET");
  if (!secret) {
    errors.push("AUTH_SECRET / NEXTAUTH_SECRET is not set — logins and every share/reset token will fail.");
  } else if (/change-in-production|your-secret-key/i.test(secret)) {
    warns.push("AUTH_SECRET is still the placeholder default — rotate it in Vercel env vars.");
  }

  // Soft requirements — features silently degrade without these.
  if (!get("NEXTAUTH_URL")) warns.push("NEXTAUTH_URL is not set — emailed links fall back to the hardcoded production URL.");
  const cron = get("CRON_SECRET");
  if (!cron) warns.push("CRON_SECRET is not set — Vercel cron calls will be rejected (no alerts/emails).");
  else if (/change-in-production/i.test(cron)) warns.push("CRON_SECRET is still the placeholder default — rotate it in Vercel env vars.");
  if (!get("RESEND_API_KEY")) warns.push("RESEND_API_KEY is not set — ALL outbound email is disabled.");
  if (!get("EMAIL_FROM")) warns.push("EMAIL_FROM is not set — outbound email uses the fallback sender, which fails on an unverified domain.");
  if (!get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || !get("VAPID_PRIVATE_KEY")) {
    warns.push("VAPID keys are not set — push notifications are disabled.");
  }

  for (const e of errors) console.error(`[env-check] ❌ ${e}`);
  for (const w of warns) console.warn(`[env-check] ⚠ ${w}`);
  if (errors.length === 0 && warns.length === 0) {
    console.log("[env-check] ✓ all required settings present");
  }
}
