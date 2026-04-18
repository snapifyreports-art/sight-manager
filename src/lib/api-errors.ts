import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Convert any thrown error into a consistent NextResponse.json 500 with
 * a user-facing message. Prisma errors get their code appended so the
 * client can show e.g. "unique constraint violation (P2002)".
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

  // Known Prisma errors — map the most common ones to friendlier messages.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const { code, meta } = err;
    let friendly = `${fallback}: ${err.message.split("\n").pop() ?? err.message}`;
    if (code === "P2002") {
      const target = Array.isArray(meta?.target) ? meta.target.join(", ") : meta?.target;
      friendly = `${fallback}: already exists (${target ?? "unique constraint"})`;
    } else if (code === "P2003") {
      friendly = `${fallback}: referenced record not found (foreign key: ${meta?.field_name ?? meta?.constraint ?? "unknown"})`;
    } else if (code === "P2025") {
      friendly = `${fallback}: record not found`;
    } else if (code === "P2011") {
      friendly = `${fallback}: required field missing (${meta?.constraint ?? "unknown"})`;
    }
    return NextResponse.json({ error: friendly, code }, { status: 500 });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    // Validation errors have noisy multi-line messages — take the last
    // non-empty line as the user-facing hint.
    const lines = err.message.split("\n").map((l) => l.trim()).filter(Boolean);
    const hint = lines[lines.length - 1] ?? "validation error";
    return NextResponse.json(
      { error: `${fallback}: ${hint}`, code: "VALIDATION" },
      { status: 400 }
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `${fallback}: ${message}` }, { status: 500 });
}
