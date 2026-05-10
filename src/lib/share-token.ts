import { createHmac, timingSafeEqual } from "crypto";

// (May 2026 audit #4) Hard-fail in production if the secret is missing.
// Pre-fix this used a "dev-fallback-secret" fallback string, which meant
// a misconfigured production deploy silently accepted forged tokens.
// Now: dev still allows the fallback (so local development isn't blocked
// when the .env is missing), but production refuses to start.
function resolveSecret(): string {
  const v = process.env.NEXTAUTH_SECRET;
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET is missing. The app refuses to start in production " +
        "without it because share-link tokens become forgeable. Set it in " +
        "Vercel project env vars and redeploy.",
    );
  }
  // Dev: log loudly so it's not silent, but allow the fallback.
  // eslint-disable-next-line no-console
  console.warn(
    "[share-token] WARNING: NEXTAUTH_SECRET unset — using dev-only fallback. Tokens will be invalid in production.",
  );
  return "dev-fallback-secret";
}

const SECRET = resolveSecret();

// ─── Contractor share tokens ──────────────────────────────────────────────────

export function signContractorToken(payload: { contactId: string; siteId: string; exp: number }): string {
  const data = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyContractorToken(token: string): { contactId: string; siteId: string; exp: number } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(fromB64url(data));
    if (typeof payload.contactId !== "string" || typeof payload.siteId !== "string") return null;
    // Contractor links are permanent — no expiry check
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
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

// Verify and decode a share token. Returns null if invalid or expired.
export function verifyShareToken(token: string): { plotId: string; exp: number } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
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
