import {
  startOfWeek,
  addWeeks,
  differenceInDays,
  format,
  isBefore,
  isAfter,
  addDays,
} from "date-fns";

/** Pixels per calendar day */
export const DAY_WIDTH = 20;

/** Row height in pixels for each job row */
export const ROW_HEIGHT = 56;

/** Width of the sticky left panel */
export const LEFT_PANEL_WIDTH = 240;

/** Height of the timeline header */
export const HEADER_HEIGHT = 48;

/**
 * Returns an array of Monday dates for every week between start and end (inclusive).
 * Both start and end are clamped to their containing week's Monday.
 */
export function getWeeksBetween(start: Date, end: Date): Date[] {
  const weeks: Date[] = [];
  let current = startOfWeek(start, { weekStartsOn: 1 });
  const lastWeek = startOfWeek(end, { weekStartsOn: 1 });

  while (!isAfter(current, lastWeek)) {
    weeks.push(current);
    current = addWeeks(current, 1);
  }

  return weeks;
}

/**
 * Returns the pixel x-offset for a given date relative to the timeline start.
 */
export function getPositionForDate(
  date: Date,
  timelineStart: Date,
  dayWidth: number = DAY_WIDTH
): number {
  const days = differenceInDays(date, timelineStart);
  return days * dayWidth;
}

/**
 * Returns the pixel width for a bar spanning from start to end.
 * Minimum width of 1 day so zero-length jobs are still visible.
 */
export function getBarWidth(
  start: Date,
  end: Date,
  dayWidth: number = DAY_WIDTH
): number {
  const days = differenceInDays(end, start);
  return Math.max(days, 1) * dayWidth;
}

/**
 * Formats a date as "12 Mar" style label for week headers.
 */
export function formatWeekLabel(date: Date): string {
  return format(date, "d MMM");
}

/**
 * Computes the timeline range from an array of jobs.
 * Returns the earliest start minus 1 week and the latest end plus 2 weeks.
 * Falls back to today +/- 4 weeks if no valid dates exist.
 */
export function getTimelineRange(
  jobs: Array<{
    startDate: string | null;
    endDate: string | null;
    orders?: Array<{
      dateOfOrder: string;
      expectedDeliveryDate: string | null;
    }>;
  }>
): { timelineStart: Date; timelineEnd: Date } {
  const today = new Date();
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const job of jobs) {
    if (job.startDate) {
      const d = new Date(job.startDate);
      if (!earliest || isBefore(d, earliest)) earliest = d;
      if (!latest || isAfter(d, latest)) latest = d;
    }
    if (job.endDate) {
      const d = new Date(job.endDate);
      if (!earliest || isBefore(d, earliest)) earliest = d;
      if (!latest || isAfter(d, latest)) latest = d;
    }

    // Also consider order dates for the range
    if (job.orders) {
      for (const order of job.orders) {
        if (order.dateOfOrder) {
          const d = new Date(order.dateOfOrder);
          if (!earliest || isBefore(d, earliest)) earliest = d;
          if (!latest || isAfter(d, latest)) latest = d;
        }
        if (order.expectedDeliveryDate) {
          const d = new Date(order.expectedDeliveryDate);
          if (!earliest || isBefore(d, earliest)) earliest = d;
          if (!latest || isAfter(d, latest)) latest = d;
        }
      }
    }
  }

  // Include today in the range calculation
  if (!earliest || isBefore(today, earliest)) earliest = today;
  if (!latest || isAfter(today, latest)) latest = today;

  const timelineStart = startOfWeek(addDays(earliest, -7), { weekStartsOn: 1 });
  const timelineEnd = addWeeks(
    startOfWeek(latest, { weekStartsOn: 1 }),
    3
  );

  return { timelineStart, timelineEnd };
}

/**
 * Returns a status color config for Gantt bar rendering.
 */
export function getStatusColor(status: string): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case "COMPLETED":
      return {
        bg: "bg-green-500/85",
        text: "text-white",
        dot: "bg-green-500",
      };
    case "IN_PROGRESS":
      return {
        bg: "bg-blue-500/85",
        text: "text-white",
        dot: "bg-blue-500",
      };
    case "ON_HOLD":
      return {
        bg: "bg-amber-500/85",
        text: "text-white",
        dot: "bg-amber-500",
      };
    case "NOT_STARTED":
    default:
      return {
        bg: "bg-gray-300/85",
        text: "text-gray-700",
        dot: "bg-gray-400",
      };
  }
}
