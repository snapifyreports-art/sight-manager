import { differenceInCalendarDays } from "date-fns";
import { addWorkingDays, differenceInWorkingDays, snapToWorkingDay } from "@/lib/working-days";

/**
 * Cascade engine — single source of truth for date shifts on a plot.
 *
 * See docs/cascade-spec.md for the full contract. Key properties:
 *
 *   I1 — The trigger job AND every downstream job shifts by the same number
 *        of working days. Working-day duration is preserved by construction
 *        (we call addWorkingDays on both start and end).
 *   I2 — addWorkingDays guarantees every result lands on a working day.
 *   I3 — Orders shift by the same working-day delta as their job; the
 *        order-to-delivery gap is preserved.
 *   I4 — COMPLETED jobs and DELIVERED/CANCELLED orders are excluded.
 *   I7 — No silent clamp to today. If a shift would put a job or pending
 *        order in the past, the result contains a conflict entry; the
 *        caller decides (abort, prompt user, or force).
 *
 * The engine returns the shift in working days plus a list of proposed
 * updates. Callers decide whether to apply (PUT) or discard (POST preview).
 */

interface CascadeJob {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
  /** Optional — when provided, COMPLETED jobs are excluded per I4. */
  status?: string;
  /** Parent job id (for sub-jobs) — when provided, parents are NOT
   *  independently shifted; their dates are re-derived from their
   *  (moved) children after the child shift is computed. */
  parentId?: string | null;
}

interface CascadeOrder {
  id: string;
  jobId: string | null;
  dateOfOrder: Date;
  expectedDeliveryDate: Date | null;
  /** Optional — when provided, DELIVERED/CANCELLED orders are excluded per I4. */
  status?: string;
}

export interface CascadeJobUpdate {
  jobId: string;
  jobName: string;
  originalStart: Date | null;
  originalEnd: Date | null;
  newStart: Date;
  newEnd: Date;
}

export interface CascadeOrderUpdate {
  orderId: string;
  jobId: string | null;
  originalOrderDate: Date;
  originalDeliveryDate: Date | null;
  newOrderDate: Date;
  newDeliveryDate: Date | null;
}

export interface CascadeConflict {
  kind: "job_in_past" | "order_in_past" | "overtakes_completed";
  jobId?: string;
  jobName?: string;
  orderId?: string;
  supplierName?: string;
  proposedDate: Date;
  today: Date;
}

export interface CascadeResult {
  /** Shift in WORKING days applied to every affected date. */
  deltaDays: number;
  /** Every job that will move — INCLUDES the trigger. */
  jobUpdates: CascadeJobUpdate[];
  orderUpdates: CascadeOrderUpdate[];
  /** Non-empty if the shift would violate I7 — caller decides what to do. */
  conflicts: CascadeConflict[];
}

/**
 * Calculate the cascade when the trigger job's end date changes.
 *
 * Scope (I5): trigger + jobs with `sortOrder > trigger.sortOrder`. For a
 * pull-forward we additionally include any job on the same plot whose
 * startDate is at or after the trigger's startDate (catches stage siblings
 * that share a start week).
 *
 * The trigger job is ALWAYS included in jobUpdates — the caller applies
 * the entire list uniformly. This is the fix for the pre-existing bug where
 * the trigger's start was computed by addWorkingDays(calendar_delta) while
 * its end was set directly to the client-supplied value, causing duration
 * to drift.
 */
export function calculateCascade(
  triggerJobId: string,
  newEndDate: Date,
  allPlotJobs: CascadeJob[],
  allOrders: CascadeOrder[],
  /**
   * (May 2026 #167) Orders the caller has elected to "force as already
   * sent" — used by the Pull Forward "Start anyway" override. Orders
   * whose id appears here are skipped by both the order_in_past conflict
   * check AND the orderUpdates shift: the cascade caller will mark them
   * ORDERED with dateOfOrder=today instead of shifting their schedule.
   */
  assumeOrdersSent: Set<string> = new Set(),
): CascadeResult {
  const trigger = allPlotJobs.find((j) => j.id === triggerJobId);
  if (!trigger || !trigger.endDate) {
    return { deltaDays: 0, jobUpdates: [], orderUpdates: [], conflicts: [] };
  }

  // Snap the requested new end date to a working day, biased toward the
  // direction of the shift (pull-forward → snap back to Friday; push-out →
  // snap forward to Monday). This stops a weekend target date from turning
  // into a no-op.
  const rawShiftCal = differenceInCalendarDays(newEndDate, trigger.endDate);
  const snapDir: "forward" | "back" = rawShiftCal >= 0 ? "forward" : "back";
  const snappedNewEnd = snapToWorkingDay(newEndDate, snapDir);

  // The delta we apply everywhere — in WORKING days. Using WD arithmetic
  // throughout guarantees duration preservation (I1) and working-day
  // alignment (I2).
  const deltaDays = differenceInWorkingDays(snappedNewEnd, trigger.endDate);
  if (deltaDays === 0) {
    return { deltaDays: 0, jobUpdates: [], orderUpdates: [], conflicts: [] };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parent jobs are aggregates — their dates are MIN/MAX of their children.
  // Shifting them independently is wrong: a parent whose first child is
  // still in the future can have a startDate that matches that child's
  // startDate, but when the cascade shifts the parent by -N working days
  // it can land in the past even though NO child actually ends up past.
  // Keith hit exactly this on Plot 17 "Brickwork — would start in the past".
  //
  // Fix: identify parents (jobs that have at least one child in the plot's
  // job list), exclude them from the per-job shift, then re-derive their
  // new start/end from the children's new positions after the main loop.
  const parentIds = new Set<string>();
  for (const j of allPlotJobs) {
    if (j.parentId) parentIds.add(j.parentId);
  }
  const isParent = (job: CascadeJob) => parentIds.has(job.id);

  // Build the set of jobs to shift. The trigger is always in; downstream is
  // by sortOrder, plus stage-sibling catch for pull-forward.
  const triggerStart = trigger.startDate;
  const jobsToShift = allPlotJobs.filter((j) => {
    if (j.status === "COMPLETED") return false;
    // Parents never shift independently — re-derived below.
    if (isParent(j)) return false;
    if (j.id === triggerJobId) return true;
    if (!j.startDate || !j.endDate) return false;
    if (j.sortOrder > trigger.sortOrder) return true;
    if (deltaDays < 0 && triggerStart && j.startDate >= triggerStart) return true;
    return false;
  });

  const jobUpdates: CascadeJobUpdate[] = [];
  const orderUpdates: CascadeOrderUpdate[] = [];
  const conflicts: CascadeConflict[] = [];

  // Track every child's new position for later parent re-derivation.
  const newPositionsById = new Map<string, { newStart: Date; newEnd: Date }>();

  for (const job of jobsToShift) {
    if (!job.startDate || !job.endDate) continue;

    // Same working-day shift to BOTH start and end. Duration preserved.
    const newStart = addWorkingDays(job.startDate, deltaDays);
    const newEnd = addWorkingDays(job.endDate, deltaDays);

    // I7 conflict: NOT_STARTED job would land in the past.
    if (
      newStart < today &&
      job.status !== "IN_PROGRESS" &&
      job.status !== "COMPLETED"
    ) {
      conflicts.push({
        kind: "job_in_past",
        jobId: job.id,
        jobName: job.name,
        proposedDate: newStart,
        today,
      });
    }

    newPositionsById.set(job.id, { newStart, newEnd });
    jobUpdates.push({
      jobId: job.id,
      jobName: job.name,
      originalStart: job.startDate,
      originalEnd: job.endDate,
      newStart,
      newEnd,
    });

    // Shift every non-historical order on this job by the same delta.
    const jobOrders = allOrders.filter((o) => o.jobId === job.id);
    for (const order of jobOrders) {
      // I4: historical/cancelled orders never move.
      if (order.status === "DELIVERED" || order.status === "CANCELLED") continue;
      // (#167) "Start anyway" override — the caller will mark these
      // ORDERED with dateOfOrder=today separately, so don't shift them
      // and don't flag them as conflicts.
      if (assumeOrdersSent.has(order.id)) continue;

      const newOrderDate = addWorkingDays(order.dateOfOrder, deltaDays);
      const newDeliveryDate = order.expectedDeliveryDate
        ? addWorkingDays(order.expectedDeliveryDate, deltaDays)
        : null;

      // I7: a PENDING order would need placing in the past.
      if (order.status === "PENDING" && newOrderDate < today) {
        conflicts.push({
          kind: "order_in_past",
          orderId: order.id,
          jobId: order.jobId ?? undefined,
          proposedDate: newOrderDate,
          today,
        });
      }

      orderUpdates.push({
        orderId: order.id,
        jobId: order.jobId,
        originalOrderDate: order.dateOfOrder,
        originalDeliveryDate: order.expectedDeliveryDate,
        newOrderDate,
        newDeliveryDate,
      });
    }
  }

  // Re-derive parent dates from their (moved) children. A parent's new
  // startDate = min of its children's new starts, endDate = max of its
  // children's new ends. If a parent's children didn't move, the parent
  // doesn't move either. Parents are NEVER flagged job_in_past — they
  // inherit validity from their children.
  for (const parent of allPlotJobs) {
    if (!isParent(parent)) continue;
    if (parent.status === "COMPLETED") continue;

    // Children of this parent that got moved.
    const movedChildren = allPlotJobs
      .filter((c) => c.parentId === parent.id)
      .map((c) => newPositionsById.get(c.id))
      .filter((pos): pos is { newStart: Date; newEnd: Date } => !!pos);

    if (movedChildren.length === 0) continue;

    const newStart = new Date(Math.min(...movedChildren.map((p) => p.newStart.getTime())));
    const newEnd = new Date(Math.max(...movedChildren.map((p) => p.newEnd.getTime())));

    jobUpdates.push({
      jobId: parent.id,
      jobName: parent.name,
      originalStart: parent.startDate,
      originalEnd: parent.endDate,
      newStart,
      newEnd,
    });
  }

  return { deltaDays, jobUpdates, orderUpdates, conflicts };
}
