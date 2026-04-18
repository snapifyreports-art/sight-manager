import { differenceInDays } from "date-fns";
import { addWorkingDays, snapToWorkingDay } from "@/lib/working-days";

interface CascadeJob {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
}

interface CascadeOrder {
  id: string;
  jobId: string | null;
  dateOfOrder: Date;
  expectedDeliveryDate: Date | null;
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

export interface CascadeResult {
  deltaDays: number;
  jobUpdates: CascadeJobUpdate[];
  orderUpdates: CascadeOrderUpdate[];
}

/**
 * Calculate cascade effects when a job's end date changes.
 * Only affects subsequent jobs (same plot, later sort order or later start date).
 */
export function calculateCascade(
  changedJobId: string,
  newEndDate: Date,
  allPlotJobs: CascadeJob[],
  allOrders: CascadeOrder[]
): CascadeResult {
  const changedJob = allPlotJobs.find((j) => j.id === changedJobId);
  if (!changedJob || !changedJob.endDate) {
    return { deltaDays: 0, jobUpdates: [], orderUpdates: [] };
  }

  const deltaDays = differenceInDays(newEndDate, changedJob.endDate);
  if (deltaDays === 0) {
    return { deltaDays: 0, jobUpdates: [], orderUpdates: [] };
  }

  // Find jobs to cascade.
  // When pulling forward (negative delta): include ALL jobs that start at or after
  // the changed job's start — this catches siblings in the same stage.
  // When pushing back (positive delta): only include jobs with higher sortOrder
  // to avoid shifting earlier jobs that shouldn't move.
  const changedStart = changedJob.startDate;
  const isPullForward = deltaDays < 0;
  const subsequentJobs = allPlotJobs
    .filter(
      (j) =>
        j.id !== changedJobId &&
        j.startDate &&
        j.endDate &&
        (j.sortOrder > changedJob.sortOrder ||
          (isPullForward && changedStart && j.startDate >= changedStart))
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const jobUpdates: CascadeJobUpdate[] = [];
  const orderUpdates: CascadeOrderUpdate[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const job of subsequentJobs) {
    if (!job.startDate || !job.endDate) continue;

    let newStart = addWorkingDays(job.startDate, deltaDays);
    const duration = differenceInDays(job.endDate, job.startDate);
    // Never push start date into the past, snap to working day
    if (newStart < today) newStart = snapToWorkingDay(today, "forward");
    else newStart = snapToWorkingDay(newStart, "forward");
    let newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + duration); // duration stays calendar days
    // Also snap end to a working day — weekend endDates break downstream cascade
    newEnd = snapToWorkingDay(newEnd, "forward");

    jobUpdates.push({
      jobId: job.id,
      jobName: job.name,
      originalStart: job.startDate,
      originalEnd: job.endDate,
      newStart,
      newEnd,
    });

    // Shift orders for this job — cap at today
    const jobOrders = allOrders.filter((o) => o.jobId === job.id);
    for (const order of jobOrders) {
      let newOrderDate = addWorkingDays(order.dateOfOrder, deltaDays);
      if (newOrderDate < today) newOrderDate = snapToWorkingDay(today, "forward");
      else newOrderDate = snapToWorkingDay(newOrderDate, "back"); // orders snap to Friday if landing on weekend
      let newDeliveryDate = order.expectedDeliveryDate
        ? addWorkingDays(order.expectedDeliveryDate, deltaDays)
        : null;
      if (newDeliveryDate && newDeliveryDate < today) newDeliveryDate = snapToWorkingDay(today, "forward");
      else if (newDeliveryDate) newDeliveryDate = snapToWorkingDay(newDeliveryDate, "back");

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

  return { deltaDays, jobUpdates, orderUpdates };
}
