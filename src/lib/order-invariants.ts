import { addDays } from "date-fns";

/**
 * (#179) Order date invariants — one place that enforces the basic
 * arithmetic so no mutation flow has to remember the rules.
 *
 * The invariants, picked apart with Keith after multiple "the field is
 * the field" frustrations:
 *
 *   INV-1: dateOfOrder <= expectedDeliveryDate
 *          You cannot expect delivery before placing the order.
 *
 *   INV-2: dateOfOrder <= deliveredDate  (when status = DELIVERED)
 *          You cannot deliver before ordering.
 *
 *   INV-3 (soft): expectedDeliveryDate should be roughly
 *          dateOfOrder + leadTimeDays when we auto-progress on job
 *          start. If the job starts late, the supplier's lead time
 *          still applies — the original expectedDeliveryDate (set
 *          back when the order was created from a template) is now
 *          stale.
 *
 * Every order-mutation flow now routes its proposed changes through
 * `enforceOrderInvariants()` so violations are clamped (not silently
 * stored). The previous behaviour produced artifacts like "delivered
 * 8 months early" in reports because the cascade had pushed
 * expectedDeliveryDate into the future but a manual DELIVER click
 * never reconciled it.
 *
 * No silent acceptance of impossible date orderings. The helper
 * clamps; it doesn't reject (UX would be worse if the user got an
 * error when they're trying to record reality).
 */

export interface OrderDateFields {
  /** Non-nullable in the schema — every order has a placement date. */
  dateOfOrder: Date;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
  /** Optional, used by INV-3 to recompute expectedDeliveryDate. */
  leadTimeDays?: number | null;
}

/**
 * Given the current persisted state and a proposed updates patch,
 * return a patch that respects every invariant. The returned patch
 * is the minimum set of writes — if a field is already consistent it
 * isn't included.
 *
 * Pass `today` so the helper is dev-date-aware (server callers should
 * use `getServerCurrentDate(req)`).
 */
export function enforceOrderInvariants(
  current: OrderDateFields,
  patch: {
    dateOfOrder?: Date;
    expectedDeliveryDate?: Date | null;
    deliveredDate?: Date | null;
    status?: string;
    leadTimeDays?: number | null;
  },
  today: Date,
): Partial<OrderDateFields> {
  // Effective field values after applying the patch.
  const effective: OrderDateFields = {
    dateOfOrder: patch.dateOfOrder ?? current.dateOfOrder,
    expectedDeliveryDate:
      patch.expectedDeliveryDate !== undefined
        ? patch.expectedDeliveryDate
        : current.expectedDeliveryDate,
    deliveredDate:
      patch.deliveredDate !== undefined ? patch.deliveredDate : current.deliveredDate,
    leadTimeDays: patch.leadTimeDays ?? current.leadTimeDays ?? null,
  };

  // INV-3: when an order is being marked ORDERED today and the
  // expectedDeliveryDate is in the past (e.g. left over from a
  // legacy template apply, or shifted backward by an EXPAND_JOB
  // path), pull it forward to today + leadTimeDays. Pre-fix this
  // was documented as a future invariant but never implemented;
  // EXPAND_JOB now relies on it to keep the order's delivery
  // promise consistent after a status flip.
  // (May 2026 audit B-P1-32 / B-P2-20 — `void today` removed.)
  if (
    patch.status === "ORDERED" &&
    effective.expectedDeliveryDate &&
    effective.expectedDeliveryDate < today
  ) {
    effective.expectedDeliveryDate = effective.leadTimeDays && effective.leadTimeDays > 0
      ? addDays(today, effective.leadTimeDays)
      : today;
  }

  // INV-1: dateOfOrder <= expectedDeliveryDate
  // If both are set and the order is wrong, push expectedDeliveryDate
  // forward. Don't pull dateOfOrder backward because that would
  // contradict the user's intent ("I'm placing this order today").
  if (
    effective.expectedDeliveryDate &&
    effective.expectedDeliveryDate < effective.dateOfOrder
  ) {
    if (effective.leadTimeDays && effective.leadTimeDays > 0) {
      // Best signal we have for "what's the supplier's promise" — bump
      // by the known lead time from the new dateOfOrder.
      effective.expectedDeliveryDate = addDays(
        effective.dateOfOrder,
        effective.leadTimeDays,
      );
    } else {
      // No lead time known — fall back to "same day as order" so the
      // ordering is at least consistent. The manager can adjust.
      effective.expectedDeliveryDate = effective.dateOfOrder;
    }
  }

  // INV-2: dateOfOrder <= deliveredDate (only meaningful when delivered)
  if (
    (patch.status === "DELIVERED" || (!patch.status && current.deliveredDate)) &&
    effective.deliveredDate &&
    effective.deliveredDate < effective.dateOfOrder
  ) {
    // Push deliveredDate forward — never backdate dateOfOrder.
    effective.deliveredDate = effective.dateOfOrder;
  }

  // Build the minimal write patch (only fields that actually differ
  // from the current persisted state).
  const out: Partial<OrderDateFields> = {};
  if (effective.dateOfOrder.getTime() !== current.dateOfOrder.getTime()) {
    out.dateOfOrder = effective.dateOfOrder;
  }
  if (
    effective.expectedDeliveryDate?.getTime() !==
    current.expectedDeliveryDate?.getTime()
  ) {
    out.expectedDeliveryDate = effective.expectedDeliveryDate;
  }
  if (effective.deliveredDate?.getTime() !== current.deliveredDate?.getTime()) {
    out.deliveredDate = effective.deliveredDate;
  }
  return out;
}

/**
 * INV-3: when auto-progressing PENDING → ORDERED on a late job start,
 * pull the expectedDeliveryDate forward by leadTimeDays from today.
 *
 * Returns the date to use for expectedDeliveryDate. Caller decides
 * whether to write it (only write if it changed).
 */
export function recomputeExpectedDeliveryOnSend(
  today: Date,
  leadTimeDays: number | null,
): Date {
  if (!leadTimeDays || leadTimeDays <= 0) return today;
  return addDays(today, leadTimeDays);
}

/**
 * (May 2026) Orphaned-order guard.
 *
 * MaterialOrder.jobId / siteId / plotId are all `onDelete: SetNull`
 * (the schema's "preserve financial history" decision). Side effect:
 * deleting a site/plot/job leaves the order alive with every context
 * link nulled — a contextless orphan that still carries its
 * PENDING/ORDERED status and delivery dates.
 *
 * Keith caught this when his daily notifications kept counting
 * "orders to send" / "overdue deliveries" for sites he'd wiped during
 * testing (160 orphans, all from test-site deletes).
 *
 * An order is "live" if it still has ANY context — a job, a site or a
 * plot. Spread this fragment into the `where` of any OPERATIONAL query
 * (notifications cron, /api/tasks, /api/orders list) so contextless
 * orphans drop out. Financial/historical views can still query them
 * directly if a use-case ever needs to.
 */
export const whereOrderNotOrphaned: {
  OR: Array<
    | { jobId: { not: null } }
    | { siteId: { not: null } }
    | { plotId: { not: null } }
  >;
} = {
  OR: [
    { jobId: { not: null } },
    { siteId: { not: null } },
    { plotId: { not: null } },
  ],
};
