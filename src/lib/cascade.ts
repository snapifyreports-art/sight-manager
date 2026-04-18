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
  allOrders: CascadeOrder[]
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

  // Build the set of jobs to shift. The trigger is always in; downstream is
  // by sortOrder, plus stage-sibling catch for pull-forward.
  const triggerStart = trigger.startDate;
  const jobsToShift = allPlotJobs.filter((j) => {
    if (j.status === "COMPLETED") return false;
    if (j.id === triggerJobId) return true;
    if (!j.startDate || !j.endDate) return false;
    if (j.sortOrder > trigger.sortOrder) return true;
    if (deltaDays < 0 && triggerStart && j.startDate >= triggerStart) return true;
    return false;
  });

  const jobUpdates: CascadeJobUpdate[] = [];
  const orderUpdates: CascadeOrderUpdate[] = [];
  const conflicts: CascadeConflict[] = [];

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

  return { deltaDays, jobUpdates, orderUpdates, conflicts };
}
