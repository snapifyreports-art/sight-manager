import { createHmac, timingSafeEqual } from "crypto";

// (May 2026 audit #4) Refuse to operate in production without the
// secret set. Pre-fix this fell back silently to "dev-fallback-secret"
// — a leaked deploy meant forgeable share links.
//
// The check is per-call (not module-load) because Next 16's build step
// evaluates server modules without env vars and would otherwise fail
// the build itself. Per-call has the same effective protection: any
// real request hits the check, any forgery attempt does too.
//
// `requireSecret()` is called by every signing/verifying function
// below — DO NOT cache or hoist this; that's how the original bug
// crept in.
function requireSecret(): string {
  const v = process.env.NEXTAUTH_SECRET;
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET is missing. The app refuses to operate in production " +
        "without it because share-link tokens become forgeable. Set it in " +
        "Vercel project env vars and redeploy.",
    );
  }
  // Dev: log loudly the first time, then quiet to avoid spam.
  if (!devWarningEmitted) {
    // eslint-disable-next-line no-console
    console.warn(
      "[share-token] WARNING: NEXTAUTH_SECRET unset — using dev-only fallback. Tokens will be invalid in production.",
    );
    devWarningEmitted = true;
  }
  return "dev-fallback-secret";
}
let devWarningEmitted = false;

// ─── Contractor share tokens ──────────────────────────────────────────────────

export function signContractorToken(payload: { contactId: string; siteId: string; exp: number }): string {
  const data = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", requireSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyContractorToken(token: string): { contactId: string; siteId: string; exp: number } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", requireSecret()).update(data).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(fromB64url(data));
    if (typeof payload.contactId !== "string" || typeof payload.siteId !== "string") return null;
    if (typeof payload.exp !== "number") return null;
    // (May 2026 audit #10) Honor the exp claim. Pre-fix the verifier
    // explicitly skipped this check, so an admin who set a 90-day
    // expiry got a token that worked forever anyway. Now exp is
    // enforced — same way the customer share token already worked.
    // Existing tokens were signed with exp = +10 years so backward
    // compatibility is preserved; new tokens can use any expiry.
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Encode an object as a URL-safe base64 string
function b64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function fromB64url(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

// Sign payload and return a compact token: base64url(payload).signature
export function signShareToken(payload: { plotId: string; exp: number }): string {
  const data = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", requireSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

// Verify and decode a share token. Returns null if invalid or expired.
export function verifyShareToken(token: string): { plotId: string; exp: number } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", requireSecret()).update(data).digest("base64url");
    // Constant-time comparison
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(fromB64url(data));
    if (typeof payload.plotId !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
