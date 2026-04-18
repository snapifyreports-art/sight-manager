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
 *       ON_HOLD      if every child is ON_HOLD or COMPLETED (mixed hold)
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
 */
export async function recomputeParentFromChildren(
  tx: Tx,
  parentJobId: string
): Promise<void> {
  const children = await tx.job.findMany({
    where: { parentId: parentJobId },
    select: { startDate: true, endDate: true, status: true },
  });
  if (children.length === 0) return;

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
  //   all (ON_HOLD | COMPLETED) with at least one ON_HOLD → ON_HOLD
  //   otherwise → NOT_STARTED
  let status: JobStatus = "NOT_STARTED";
  if (statuses.length > 0 && statuses.every((s) => s === "COMPLETED")) {
    status = "COMPLETED";
  } else if (statuses.some((s) => s === "IN_PROGRESS")) {
    status = "IN_PROGRESS";
  } else if (
    statuses.some((s) => s === "ON_HOLD") &&
    statuses.every((s) => s === "ON_HOLD" || s === "COMPLETED")
  ) {
    status = "ON_HOLD";
  }

  const minStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const maxEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;

  await tx.job.update({
    where: { id: parentJobId },
    data: {
      startDate: minStart,
      endDate: maxEnd,
      status,
    },
  });
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
