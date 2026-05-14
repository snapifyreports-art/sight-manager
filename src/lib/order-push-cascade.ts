/**
 * (May 2026) Job-push cascade — shared apply step.
 *
 * Extracted from PUT /api/orders/[id] so the "push the plot back"
 * machinery has ONE implementation. Two callers:
 *
 *   1. The delivery-date-change "PUSH_JOB" impact — when a manager
 *      pushes a delivery date later and chooses to move the dependent
 *      job with it.
 *   2. The "Change delivery date & push the plot back" choice in the
 *      order-sent-late popup.
 *
 * Both need exactly the same downstream behaviour: shift the trigger
 * job to a new end date, cascade every later job + its PENDING orders
 * by the same working-day delta, re-derive parent rollups, drop a
 * SCHEDULE_CASCADED breadcrumb. The cascade maths itself lives in
 * `calculateCascade` (src/lib/cascade.ts); this is purely the apply.
 *
 * Conflict-safe: if the cascade would put any job or PENDING order in
 * the past it writes NOTHING and returns `{ applied: false }` — the
 * caller's lateness record still lands, and the manager can re-trigger
 * via the normal cascade UI.
 */

import type { PrismaClient } from "@prisma/client";
import { calculateCascade } from "@/lib/cascade";
import { recomputeParentFromChildren } from "@/lib/parent-job";

export interface JobPushCascadeArgs {
  /** The job whose end date is moving — cascade flows from here. */
  triggerJobId: string;
  /** The trigger job's new end date (working-day-aligned by the engine). */
  triggerJobNewEnd: Date;
  plotId: string;
  siteId: string;
  userId: string | null;
  /**
   * An order the caller has already re-dated directly (e.g. the order
   * being sent late, whose delivery date the popup just set). The
   * cascade must not also shift it.
   */
  excludeOrderId?: string;
  /**
   * Prefix for the SCHEDULE_CASCADED EventLog row — the helper appends
   * the working-day delta + jobs-shifted count, e.g.
   * "Late send → plot pushed: +3 WD, 7 jobs shifted".
   */
  logLabel: string;
}

export interface JobPushCascadeResult {
  /** False when conflicts blocked the write — nothing was changed. */
  applied: boolean;
  jobsShifted: number;
  /** Working-day delta the cascade applied (0 = no-op). */
  deltaDays: number;
  conflicts: number;
}

export async function applyJobPushCascade(
  db: PrismaClient,
  args: JobPushCascadeArgs,
): Promise<JobPushCascadeResult> {
  const allPlotJobs = await db.job.findMany({
    where: { plotId: args.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });
  const allOrders = await db.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
  });

  const cascade = calculateCascade(
    args.triggerJobId,
    args.triggerJobNewEnd,
    allPlotJobs.map((j) => ({
      id: j.id,
      name: j.name,
      startDate: j.startDate,
      endDate: j.endDate,
      sortOrder: j.sortOrder,
      status: j.status,
      parentId: j.parentId ?? null,
    })),
    allOrders.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      dateOfOrder: o.dateOfOrder,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
    })),
  );

  // I7: never silently land something in the past. Bail without writing.
  if (cascade.conflicts.length > 0) {
    return {
      applied: false,
      jobsShifted: 0,
      deltaDays: cascade.deltaDays,
      conflicts: cascade.conflicts.length,
    };
  }
  // No movement needed (delta snapped to 0) — nothing to do, but it's
  // still a clean "applied" outcome.
  if (cascade.jobUpdates.length === 0) {
    return { applied: true, jobsShifted: 0, deltaDays: 0, conflicts: 0 };
  }

  const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));
  await Promise.all([
    ...cascade.jobUpdates.map((u) => {
      const cur = jobMap.get(u.jobId);
      return db.job.update({
        where: { id: u.jobId },
        data: {
          startDate: u.newStart,
          endDate: u.newEnd,
          // Snapshot the original dates the first time a job moves so
          // Overlay mode can always show the "was" row.
          ...(!cur?.originalStartDate && cur?.startDate
            ? { originalStartDate: cur.startDate }
            : {}),
          ...(!cur?.originalEndDate && cur?.endDate
            ? { originalEndDate: cur.endDate }
            : {}),
        },
      });
    }),
    ...cascade.orderUpdates
      // The caller already set this order's dates — don't double-move it.
      .filter((u) => u.orderId !== args.excludeOrderId)
      .map((u) =>
        db.materialOrder.update({
          where: { id: u.orderId },
          data: {
            dateOfOrder: u.newOrderDate,
            expectedDeliveryDate: u.newDeliveryDate,
          },
        }),
      ),
  ]);

  // Parent rollups affected by the shift.
  const parentIds = new Set<string>();
  for (const u of cascade.jobUpdates) {
    const j = jobMap.get(u.jobId);
    if (j?.parentId) parentIds.add(j.parentId);
  }
  await Promise.all(
    Array.from(parentIds).map((pid) => recomputeParentFromChildren(db, pid)),
  );

  await db.eventLog
    .create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `${args.logLabel}: ${cascade.deltaDays > 0 ? "+" : ""}${cascade.deltaDays} WD, ${cascade.jobUpdates.length} job${cascade.jobUpdates.length === 1 ? "" : "s"} shifted`,
        siteId: args.siteId,
        plotId: args.plotId,
        jobId: args.triggerJobId,
        userId: args.userId,
      },
    })
    .catch(() => {});

  return {
    applied: true,
    jobsShifted: cascade.jobUpdates.length,
    deltaDays: cascade.deltaDays,
    conflicts: 0,
  };
}
