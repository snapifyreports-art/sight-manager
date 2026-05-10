import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * (May 2026 audit #70) Friendly-message string formatter — same mapping
 * as apiError() but returns a plain string instead of a NextResponse.
 * Used by routes that accumulate per-item errors into a list (e.g.
 * batch apply-template) so individual error messages don't leak raw
 * Prisma internals to clients.
 */
export function friendlyMessage(err: unknown, fallback = "Operation failed"): string {
  const isProd = process.env.NODE_ENV === "production";

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const { code, meta } = err;
    if (code === "P2002") {
      const target = Array.isArray(meta?.target) ? meta.target.join(", ") : meta?.target;
      return `${fallback}: already exists${target ? ` (${target})` : ""}`;
    }
    if (code === "P2003") return `${fallback}: referenced record no longer exists`;
    if (code === "P2025") return `${fallback}: record not found`;
    if (code === "P2011") return `${fallback}: required field missing`;
    return isProd
      ? fallback
      : `${fallback}: ${err.message.split("\n").pop() ?? err.message}`;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    if (isProd) return `${fallback}: invalid input`;
    const lines = err.message.split("\n").map((l) => l.trim()).filter(Boolean);
    return `${fallback}: ${lines[lines.length - 1] ?? "validation error"}`;
  }

  if (isProd) return fallback;
  const message = err instanceof Error ? err.message : String(err);
  return `${fallback}: ${message}`;
}

/**
 * Convert any thrown error into a consistent NextResponse.json with a
 * user-facing message. Prisma errors are mapped to friendly copy by code.
 *
 * (May 2026 audit #70) Friendly errors. Three rules:
 *   1. Always log the full error server-side (so we can debug from logs).
 *   2. Map known Prisma codes to copy a customer-facing user can read
 *      ("That name's already taken" beats "Unique constraint failed on
 *      the fields: (`name`)").
 *   3. In production, the raw Prisma message is NEVER returned to the
 *      client — only the friendly mapped message + the code. Prisma
 *      messages can leak schema field names / SQL fragments.
 *      In development we keep the raw message so devs can debug.
 *
 * Usage pattern in any POST/PUT/DELETE route:
 *
 *   try {
 *     // ...mutations
 *     return NextResponse.json(result, { status: 201 });
 *   } catch (err) {
 *     return apiError(err, "Failed to create plot");
 *   }
 */
export function apiError(err: unknown, fallback = "Operation failed"): NextResponse {
  console.error(`[api] ${fallback}:`, err);

  const isProd = process.env.NODE_ENV === "production";

  // Known Prisma errors — map the most common ones to friendlier messages.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const { code, meta } = err;
    let friendly = fallback;
    let status = 500;
    if (code === "P2002") {
      const target = Array.isArray(meta?.target) ? meta.target.join(", ") : meta?.target;
      friendly = `${fallback}: already exists${target ? ` (${target})` : ""}`;
      status = 409; // Conflict
    } else if (code === "P2003") {
      friendly = `${fallback}: referenced record no longer exists`;
      status = 409;
    } else if (code === "P2025") {
      friendly = `${fallback}: record not found`;
      status = 404;
    } else if (code === "P2011") {
      friendly = `${fallback}: required field missing`;
      status = 400;
    } else if (!isProd) {
      // Unknown Prisma code in dev: include the raw last-line for debugging.
      friendly = `${fallback}: ${err.message.split("\n").pop() ?? err.message}`;
    }
    return NextResponse.json({ error: friendly, code }, { status });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    // Validation errors have noisy multi-line messages. In prod we
    // collapse to a generic message; in dev we surface the last line.
    const friendly = isProd
      ? `${fallback}: invalid input`
      : (() => {
          const lines = err.message.split("\n").map((l) => l.trim()).filter(Boolean);
          return `${fallback}: ${lines[lines.length - 1] ?? "validation error"}`;
        })();
    return NextResponse.json(
      { error: friendly, code: "VALIDATION" },
      { status: 400 }
    );
  }

  // Generic Error / unknown thrown value. In prod we never return the
  // raw message — could leak stack traces, file paths, internal DB
  // details. In dev the raw message helps debugging.
  if (isProd) {
    return NextResponse.json({ error: fallback }, { status: 500 });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `${fallback}: ${message}` }, { status: 500 });
}
