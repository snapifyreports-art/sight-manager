/**
 * Helpers for managing hierarchical Jobs (parent Jobs with child sub-jobs).
 *
 * When a template has a parent stage ("First Fix") with sub-jobs ("First-fix
 * electrics", "First-fix plumbing", etc), apply-template creates a REAL parent
 * Job row. The parent's dates and status are DERIVED from its children:
 *
 *   - startDate = earliest child startDate
 *   - endDate   = latest child endDate
 *   - status:
 *       COMPLETED    if every child is COMPLETED
 *       IN_PROGRESS  if any child is IN_PROGRESS
 *       ON_HOLD      if any child is ON_HOLD (no IN_PROGRESS — IN_PROGRESS wins)
 *       NOT_STARTED  otherwise
 *
 * This file provides `recomputeParentFromChildren(tx, parentId)` which callers
 * invoke after any mutation to a child Job (start/complete/delay/cascade/edit).
 *
 * Important: parent Jobs are INFRASTRUCTURE, not workflow targets. Users click
 * start/complete on leaf child jobs; parent status follows. Views that list
 * "actionable jobs" should filter out parents via `{ children: { none: {} } }`.
 */

import type { JobStatus, Prisma, PrismaClient } from "@prisma/client";

// Accept either the top-level PrismaClient or a transactional client from prisma.$transaction
type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute a parent Job's dates and status from its children.
 * No-op if the parent has no children (safe to call on leaf jobs).
 *
 * (May 2026 audit P-P0-9) Returns the new parent row so reconcile + other
 * drift-detection callers don't have to issue a second findUnique to read
 * what we just computed. Existing void-returning consumers can ignore.
 */
export interface RecomputedParent {
  startDate: Date | null;
  endDate: Date | null;
  status: JobStatus;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  originalStartDate: Date | null;
  originalEndDate: Date | null;
}

export async function recomputeParentFromChildren(
  tx: Tx,
  parentJobId: string
): Promise<RecomputedParent | null> {
  const children = await tx.job.findMany({
    where: { parentId: parentJobId },
    select: {
      startDate: true,
      endDate: true,
      status: true,
      // May 2026 audit (#5/#6/#25): rollup must include actuals + originals
      // so the real parent row matches what synthetic parent rendering does
      // live. Keeps Plot Detail Gantt + reports in sync with Programme.
      actualStartDate: true,
      actualEndDate: true,
      originalStartDate: true,
      originalEndDate: true,
    },
  });
  // (May 2026 audit B-P1-30) Empty-children case: parent has no
  // children left (last child was deleted in this tx). Return null so
  // the caller knows to skip the update — the parent row remains
  // intact with its previously-derived dates so reports show the
  // historical envelope rather than going blank. Callers that want
  // to delete the orphan parent should do so explicitly (currently
  // none — child-delete in /api/jobs/[id]/route.ts leaves orphan
  // parents alone, since SetNull on the self-relation means children
  // would normally outlive the parent, not the reverse).
  if (children.length === 0) return null;

  const starts = children
    .map((c) => c.startDate)
    .filter((d): d is Date => d !== null);
  const ends = children
    .map((c) => c.endDate)
    .filter((d): d is Date => d !== null);
  const statuses = children.map((c) => c.status);

  // Status derivation — mirrors Keith's model:
  //   all COMPLETED → COMPLETED
  //   any IN_PROGRESS → IN_PROGRESS
  //   any ON_HOLD (with no IN_PROGRESS) → ON_HOLD
  //   otherwise → NOT_STARTED
  //
  // (May 2026 audit B-P1-23) Pre-fix the ON_HOLD branch required EVERY
  // non-ON_HOLD child to be COMPLETED. So a parent with 4 NOT_STARTED
  // sub-jobs + 1 ON_HOLD sub-job fell to the "otherwise → NOT_STARTED"
  // branch — pausing a scheduled sub-job had no visible effect on the
  // parent. Now: any ON_HOLD child propagates ON_HOLD to the parent
  // (provided no child is actively in-progress, which still wins).
  let status: JobStatus = "NOT_STARTED";
  if (statuses.length > 0 && statuses.every((s) => s === "COMPLETED")) {
    status = "COMPLETED";
  } else if (statuses.some((s) => s === "IN_PROGRESS")) {
    status = "IN_PROGRESS";
  } else if (statuses.some((s) => s === "ON_HOLD")) {
    status = "ON_HOLD";
  }

  const minStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const maxEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;

  // Actuals: min start across children that have started; end only when
  // every child has actually finished (otherwise the parent isn't done).
  const actualStarts = children
    .map((c) => c.actualStartDate)
    .filter((d): d is Date => d !== null);
  const actualEnds = children
    .map((c) => c.actualEndDate)
    .filter((d): d is Date => d !== null);
  const minActualStart = actualStarts.length
    ? new Date(Math.min(...actualStarts.map((d) => d.getTime())))
    : null;
  // Parent only "actually finished" once every child finished — avoids
  // claiming completion when one sub-job is still running.
  const allChildrenComplete =
    statuses.length > 0 && statuses.every((s) => s === "COMPLETED");
  const maxActualEnd = allChildrenComplete && actualEnds.length
    ? new Date(Math.max(...actualEnds.map((d) => d.getTime())))
    : null;

  // Originals: simple min/max across children — these are the planned
  // baseline so they should reflect the earliest planned start and the
  // latest planned end across the parent window.
  const origStarts = children
    .map((c) => c.originalStartDate)
    .filter((d): d is Date => d !== null);
  const origEnds = children
    .map((c) => c.originalEndDate)
    .filter((d): d is Date => d !== null);
  const minOrigStart = origStarts.length
    ? new Date(Math.min(...origStarts.map((d) => d.getTime())))
    : null;
  const maxOrigEnd = origEnds.length
    ? new Date(Math.max(...origEnds.map((d) => d.getTime())))
    : null;

  await tx.job.update({
    where: { id: parentJobId },
    data: {
      startDate: minStart,
      endDate: maxEnd,
      status,
      actualStartDate: minActualStart,
      actualEndDate: maxActualEnd,
      // originals are NOT NULL on the schema — only update if we have values
      ...(minOrigStart ? { originalStartDate: minOrigStart } : {}),
      ...(maxOrigEnd ? { originalEndDate: maxOrigEnd } : {}),
    },
  });

  return {
    startDate: minStart,
    endDate: maxEnd,
    status,
    actualStartDate: minActualStart,
    actualEndDate: maxActualEnd,
    // For the return, keep current values when we didn't set them — the
    // parent's existing originals are still the truth.
    originalStartDate: minOrigStart,
    originalEndDate: maxOrigEnd,
  };
}

/**
 * If the given job has a parent, recompute that parent. Safe to call for any
 * child mutation — does nothing for leaf jobs without a parent.
 */
export async function recomputeParentOf(tx: Tx, childJobId: string): Promise<void> {
  const child = await tx.job.findUnique({
    where: { id: childJobId },
    select: { parentId: true },
  });
  if (!child?.parentId) return;
  await recomputeParentFromChildren(tx, child.parentId);
}
