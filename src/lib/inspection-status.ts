/**
 * Inspections SSoT — alert-window where-builders + predicates.
 *
 * One place that defines the date windows so the cron, the Daily Brief,
 * the email digest and the top-level page all agree. Mirrors the
 * lateness.ts whereJobEndOverdue pattern (pure column comparisons), with
 * one per-row exception: booking-due depends on each row's own
 * bookingLeadWeeks, so it pairs a coarse `where` with a row predicate.
 */
import { addDays, isSameDay } from "date-fns";

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

/**
 * Inspections that should flip to OVERDUE: scheduled date passed and not
 * yet resolved (still SCHEDULED or BOOKED). The cron sets status=OVERDUE.
 */
export function whereInspectionOverdueCandidates(today: Date) {
  return {
    scheduledDate: { lt: today },
    status: { in: ["SCHEDULED", "BOOKED"] as const },
  };
}

/** Inspections scheduled for today (day-of alert). */
export function whereInspectionDayOf(today: Date) {
  return {
    scheduledDate: { gte: today, lt: addDays(today, 1) },
    status: { in: ["SCHEDULED", "BOOKED", "OVERDUE"] as const },
  };
}

/** Inspections scheduled exactly one week out (week-before alert). */
export function whereInspectionWeekBefore(today: Date) {
  return {
    scheduledDate: { gte: addDays(today, 7), lt: addDays(today, 8) },
    status: { in: ["SCHEDULED", "BOOKED"] as const },
  };
}

/**
 * Coarse pre-filter for the booking-due alert. Booking-due itself is
 * per-row (scheduledDate − bookingLeadWeeks) so apply `isBookingDueOn`
 * after fetching this candidate set.
 */
export function whereInspectionBookingDueCandidates(today: Date) {
  return {
    bookingLeadWeeks: { not: null },
    status: "SCHEDULED" as const, // not booked yet
    scheduledDate: { gte: today }, // booking-due never after the inspection
  };
}

/** The date by which this inspection should be booked. null if no lead set. */
export function bookingDueDate(inspection: {
  scheduledDate: Date | string;
  bookingLeadWeeks: number | null;
}): Date | null {
  if (inspection.bookingLeadWeeks == null) return null;
  return addDays(toDate(inspection.scheduledDate), -inspection.bookingLeadWeeks * 7);
}

/** True when `today` is this inspection's booking-due day. */
export function isBookingDueOn(
  inspection: { scheduledDate: Date | string; bookingLeadWeeks: number | null },
  today: Date,
): boolean {
  const due = bookingDueDate(inspection);
  return due != null && isSameDay(due, today);
}
