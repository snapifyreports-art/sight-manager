/**
 * Shared helper: re-pack a parent stage's children by day cursor and
 * compute each child's `startWeek` / `endWeek` cache from the canonical
 * `durationDays + sortOrder`.
 *
 * SSOT context (May 2026 rework + audit-driven correction):
 *
 *   - The canonical source for sub-job layout is `durationDays` + the
 *     parent's first day. The TemplateTimeline already renders bars at
 *     day-level granularity directly from that.
 *   - But other readers — the order-dialog's "anchor to which job"
 *     dropdown, the collapsed-stage order dot positioning, the
 *     server-side offset derivation in `template-order-offsets.ts`, the
 *     `normaliseTemplateParentDates` rollup — all consult the per-child
 *     `startWeek` / `endWeek` cache.
 *   - Removing those writes (commit c3519ac, "Step 2") left the cache
 *     stale and broke those readers. This helper keeps the cache fresh
 *     without making it the source of truth: it's computed from
 *     `durationDays + sortOrder` on every recalculate, so it stays in
 *     lock-step with the canonical fields.
 *
 * Behaviour:
 *   - Child `startWeek` = parent.startWeek + floor(dayCursor / 5)
 *   - Child `endWeek`   = parent.startWeek + floor((dayCursor + days - 1) / 5)
 *   - Multiple children may share a week if their durations don't fill
 *     a whole one (e.g. two 2-day sub-jobs back to back occupy week N
 *     Mon-Thu; the third one starts Friday of week N).
 *   - Parent `endWeek`  = parent.startWeek + ceil(totalDays / 5) - 1
 *     (always >= parent.startWeek so the parent is at least one week
 *     wide, even when it has zero children).
 */

import type { PrismaClient, Prisma } from "@prisma/client";

interface ChildLike {
  id: string;
  durationDays: number | null;
  durationWeeks: number | null;
}

interface ParentLike {
  id: string;
  startWeek: number;
}

/**
 * Convert a child's stored duration fields into working days. Mirrors the
 * apply-template fallback chain so every reader agrees on "how many days
 * does this sub-job take".
 */
export function childDurationDays(child: ChildLike): number {
  if (child.durationDays && child.durationDays > 0) return child.durationDays;
  if (child.durationWeeks && child.durationWeeks > 0) return child.durationWeeks * 5;
  return 5;
}

/**
 * Run inside a Prisma transaction. Updates each child's startWeek/endWeek
 * cache and the parent's endWeek to span the children. Returns the new
 * parent endWeek for callers that want to log it.
 */
export async function packChildrenAndUpdateParent(
  tx: PrismaClient | Prisma.TransactionClient,
  parent: ParentLike,
  children: ChildLike[],
): Promise<number> {
  let dayCursor = 0;
  for (const child of children) {
    const days = childDurationDays(child);
    const startWeek = parent.startWeek + Math.floor(dayCursor / 5);
    const endWeek = parent.startWeek + Math.floor((dayCursor + days - 1) / 5);
    await tx.templateJob.update({
      where: { id: child.id },
      data: { startWeek, endWeek },
    });
    dayCursor += days;
  }

  const totalWeeks = Math.max(1, Math.ceil(dayCursor / 5));
  const newEndWeek = parent.startWeek + totalWeeks - 1;
  await tx.templateJob.update({
    where: { id: parent.id },
    data: { endWeek: newEndWeek },
  });
  return newEndWeek;
}
