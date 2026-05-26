import type { Prisma } from "@prisma/client";

/**
 * (May 2026 SSoT pass) Single source of truth for "is a snag
 * open / resolved" semantics.
 *
 * SnagStatus values in the schema are OPEN, IN_PROGRESS, RESOLVED,
 * CLOSED. Earlier audit pass discovered the codebase had multiple
 * inconsistent rules — site-story counted only RESOLVED as
 * resolved (missing CLOSED), per-plot snagsOpen counted everything
 * non-RESOLVED as open (including CLOSED), the contractor scorecard
 * counted RESOLVED OR CLOSED as resolved. These helpers + Prisma
 * predicates centralise the rule so no future report invents a
 * fourth interpretation.
 *
 *   Resolved = RESOLVED || CLOSED  — terminal state, either route
 *   Open     = OPEN     || IN_PROGRESS — actionable
 */

export const SNAG_RESOLVED_STATUSES = ["RESOLVED", "CLOSED"] as const;
export const SNAG_OPEN_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/** True when the snag has reached a terminal state (either route). */
export function isSnagResolved(status: string | null | undefined): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

/** True when the snag is still actionable (OPEN or IN_PROGRESS). */
export function isSnagOpen(status: string | null | undefined): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

/** Prisma where-clause fragment for "open" snags. Use as
 *  `{ ...whereSnagOpen(), plot: { siteId } }`. */
export function whereSnagOpen(): Prisma.SnagWhereInput {
  return { status: { in: ["OPEN", "IN_PROGRESS"] } };
}

/** Prisma where-clause fragment for "resolved" snags. */
export function whereSnagResolved(): Prisma.SnagWhereInput {
  return { status: { in: ["RESOLVED", "CLOSED"] } };
}
