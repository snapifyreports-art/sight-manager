import { differenceInCalendarDays } from "date-fns";

export type ScheduleStatus =
  | "ahead"
  | "on_track"
  | "behind"
  | "not_started"
  | "complete"
  | "awaiting_restart"
  | "idle";

export interface PlotScheduleStatus {
  status: ScheduleStatus;
  daysDeviation: number; // positive = ahead of original, negative = behind
}

const THRESHOLD_DAYS = 3;

/**
 * Compute a plot's schedule status vs its original programme.
 * Uses originalStartDate on the current/next job as the baseline.
 * positive daysDeviation = ahead (programme pulled forward)
 * negative daysDeviation = behind (programme pushed back)
 */
export function getPlotScheduleStatus(
  jobs: Array<{
    status: string;
    startDate: Date | string | null;
    originalStartDate?: Date | string | null;
    sortOrder: number;
  }>,
  awaitingRestart = false
): PlotScheduleStatus {
  if (awaitingRestart) {
    return { status: "awaiting_restart", daysDeviation: 0 };
  }

  if (jobs.length === 0) {
    return { status: "not_started", daysDeviation: 0 };
  }

  const sorted = [...jobs].sort((a, b) => a.sortOrder - b.sortOrder);
  const allCompleted = sorted.every((j) => j.status === "COMPLETED");
  const allNotStarted = sorted.every((j) => j.status === "NOT_STARTED");

  if (allNotStarted) return { status: "not_started", daysDeviation: 0 };
  if (allCompleted) return { status: "complete", daysDeviation: 0 };

  // Detect idle: some completed, none in-progress, and today falls in the gap
  // between the last completed job's end and the next scheduled job's start
  const hasCompleted = sorted.some((j) => j.status === "COMPLETED");
  const hasInProgress = sorted.some((j) => j.status === "IN_PROGRESS");

  if (hasCompleted && !hasInProgress) {
    const nextJob = sorted.find((j) => j.status === "NOT_STARTED");
    if (nextJob?.startDate) {
      const nextStart = new Date(nextJob.startDate as string);
      if (nextStart > new Date()) {
        return { status: "idle", daysDeviation: 0 };
      }
    }
  }

  // First non-completed job
  const current = sorted.find((j) => j.status !== "COMPLETED");
  if (!current?.originalStartDate || !current?.startDate) {
    return { status: "on_track", daysDeviation: 0 };
  }

  const orig = new Date(current.originalStartDate as string);
  const curr = new Date(current.startDate as string);
  const days = differenceInCalendarDays(orig, curr); // positive = curr is earlier = ahead

  if (days > THRESHOLD_DAYS) return { status: "ahead", daysDeviation: days };
  if (days < -THRESHOLD_DAYS) return { status: "behind", daysDeviation: days };
  return { status: "on_track", daysDeviation: days };
}

export function scheduleStatusColors(status: ScheduleStatus) {
  switch (status) {
    case "ahead":
      return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "behind":
      return { dot: "bg-red-500", badge: "bg-red-100 text-red-700 border-red-200" };
    case "awaiting_restart":
      return { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 border-amber-200" };
    case "idle":
      return { dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700 border-orange-200" };
    case "complete":
      return { dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-600 border-emerald-100" };
    case "not_started":
    default:
      return { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500 border-slate-200" };
    case "on_track":
      return { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700 border-blue-200" };
  }
}

export function scheduleStatusLabel(status: ScheduleStatus, days: number): string {
  switch (status) {
    case "ahead":         return `${days}d ahead`;
    case "behind":        return `${Math.abs(days)}d behind`;
    case "on_track":      return "On track";
    case "awaiting_restart": return "Deferred";
    case "idle":          return "Idle";
    case "complete":      return "Complete";
    case "not_started":   return "Not started";
    default:              return "";
  }
}

/** Next Monday at 00:00 from a given date */
export function getNextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun
  const add = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + add);
  d.setHours(0, 0, 0, 0);
  return d;
}
