import { differenceInWorkingDays } from "@/lib/working-days";

/**
 * (#177) Single source of truth for "is this job late?" semantics.
 *
 * Before this module the boolean was reinvented in 5+ places:
 *   - Daily Brief API
 *   - Tasks API
 *   - Dashboard page query
 *   - SiteHeatmap API
 *   - Analytics route
 * Each subtly different: some used `lt: dayStart`, some `lt: now`, some
 * recomputed inline in JS, and the Heatmap used `differenceInDays`
 * (calendar) instead of working days — which silently divergedthe RAG
 * thresholds from every other view.
 *
 * Rule, finalised with Keith May 2026:
 *   - "Overdue end" = end-date in the past AND status != COMPLETED.
 *     Past = strictly before today (today itself is not overdue).
 *   - "Overdue start" = start-date in the past AND status == NOT_STARTED.
 *     A job that's already IN_PROGRESS is by definition not late-starting.
 *   - Days overdue is ALWAYS measured in WORKING days. Calendar
 *     differenceInDays is wrong for this domain — weekends don't make
 *     a job more behind.
 *
 * The Prisma `where` helpers return Prisma filter clauses so callers
 * pass them directly into findMany. The boolean / number helpers
 * operate on already-fetched job shapes so they can be used in
 * component renders and aggregations.
 */

interface LeafJobShape {
  status: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return typeof d === "string" ? new Date(d) : d;
}

/**
 * True when the job has missed its planned end date. Works for any
 * non-COMPLETED status — IN_PROGRESS, NOT_STARTED, ON_HOLD all count.
 * `today` is the caller's anchor (use `getServerCurrentDate(req)` on
 * the server, `getCurrentDateAtMidnight()` on the client).
 */
export function isJobEndOverdue(job: LeafJobShape, today: Date): boolean {
  if (job.status === "COMPLETED") return false;
  const end = toDate(job.endDate);
  if (!end) return false;
  return end < today;
}

/**
 * True when a job should have started but hasn't. Only NOT_STARTED is
 * a candidate — once IN_PROGRESS the "late start" is realised, not
 * pending.
 */
export function isJobStartOverdue(job: LeafJobShape, today: Date): boolean {
  if (job.status !== "NOT_STARTED") return false;
  const start = toDate(job.startDate);
  if (!start) return false;
  return start < today;
}

/**
 * Working days the job is past its planned end. Returns 0 if not
 * overdue. Always working days — never calendar.
 */
export function workingDaysEndOverdue(job: LeafJobShape, today: Date): number {
  if (!isJobEndOverdue(job, today)) return 0;
  const end = toDate(job.endDate)!;
  return differenceInWorkingDays(today, end);
}

/**
 * Working days the job is past its planned start. Returns 0 if not
 * late-starting.
 */
export function workingDaysStartOverdue(job: LeafJobShape, today: Date): number {
  if (!isJobStartOverdue(job, today)) return 0;
  const start = toDate(job.startDate)!;
  return differenceInWorkingDays(today, start);
}

/**
 * Prisma where-clause builder for "jobs overdue at end". Use inside a
 * findMany call. `today` is the date floor — pass it ALWAYS so dev-
 * date overrides are respected. Add other constraints (`plot.siteId`,
 * `children: { none: {} }`, etc.) as siblings.
 */
export function whereJobEndOverdue(today: Date) {
  return {
    endDate: { lt: today },
    status: { not: "COMPLETED" as const },
  };
}

/**
 * Prisma where-clause builder for "jobs that should have started but
 * haven't". Mirror of whereJobEndOverdue for NOT_STARTED jobs.
 */
export function whereJobStartOverdue(today: Date) {
  return {
    startDate: { lt: today },
    status: "NOT_STARTED" as const,
  };
}

interface OrderShape {
  status: string;
  expectedDeliveryDate?: Date | string | null;
}

/**
 * True when an order is ORDERED with a past expectedDeliveryDate.
 * DELIVERED / CANCELLED are excluded by definition; PENDING isn't
 * "overdue" because it hasn't been placed yet (use a different
 * helper for "order needs placing").
 */
export function isOrderOverdue(order: OrderShape, today: Date): boolean {
  if (order.status !== "ORDERED") return false;
  const exp = toDate(order.expectedDeliveryDate);
  if (!exp) return false;
  return exp < today;
}

/** Prisma where-clause builder for overdue orders. */
export function whereOrderOverdue(today: Date) {
  return {
    status: "ORDERED" as const,
    expectedDeliveryDate: { lt: today },
  };
}
