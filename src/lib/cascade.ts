import { addDays, differenceInDays } from "date-fns";

interface CascadeJob {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
}

interface CascadeOrder {
  id: string;
  jobId: string;
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

  // Find subsequent jobs (higher sort order, or same sort order but later start)
  const subsequentJobs = allPlotJobs
    .filter(
      (j) =>
        j.id !== changedJobId &&
        j.startDate &&
        j.endDate &&
        (j.sortOrder > changedJob.sortOrder ||
          (j.sortOrder === changedJob.sortOrder &&
            j.startDate > changedJob.endDate!))
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const jobUpdates: CascadeJobUpdate[] = [];
  const orderUpdates: CascadeOrderUpdate[] = [];

  for (const job of subsequentJobs) {
    if (!job.startDate || !job.endDate) continue;

    const newStart = addDays(job.startDate, deltaDays);
    const newEnd = addDays(job.endDate, deltaDays);

    jobUpdates.push({
      jobId: job.id,
      jobName: job.name,
      originalStart: job.startDate,
      originalEnd: job.endDate,
      newStart,
      newEnd,
    });

    // Shift orders for this job
    const jobOrders = allOrders.filter((o) => o.jobId === job.id);
    for (const order of jobOrders) {
      const newOrderDate = addDays(order.dateOfOrder, deltaDays);
      const newDeliveryDate = order.expectedDeliveryDate
        ? addDays(order.expectedDeliveryDate, deltaDays)
        : null;

      orderUpdates.push({
        orderId: order.id,
        originalOrderDate: order.dateOfOrder,
        originalDeliveryDate: order.expectedDeliveryDate,
        newOrderDate,
        newDeliveryDate,
      });
    }
  }

  return { deltaDays, jobUpdates, orderUpdates };
}
