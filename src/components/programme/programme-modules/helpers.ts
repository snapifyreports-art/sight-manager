/**
 * Pure helpers used across SiteProgramme + its sub-components.
 *
 * (May 2026 sprint 7b) Extracted from SiteProgramme.tsx. Side-effect
 * free — every function here is deterministic given its inputs and
 * can be tested in isolation. Component-state-dependent helpers
 * stay inside the main component.
 */

import { format, isWeekend, startOfWeek } from "date-fns";
import { getCurrentStage } from "@/lib/plot-stage";
import { getStageCode } from "@/lib/stage-codes";
import {
  STATUS_PRIORITY,
  type ProgrammeJob,
  type ProgrammePlot,
} from "./types";

/** Emoji icon for a weather category (used in cell tooltips). */
export function weatherEmoji(category: string): string {
  switch (category) {
    case "clear":
      return "☀️";
    case "partly_cloudy":
      return "⛅";
    case "cloudy":
      return "☁️";
    case "fog":
      return "🌫️";
    case "rain":
      return "🌧️";
    case "snow":
      return "🌨️";
    case "thunder":
      return "⛈️";
    default:
      return "☁️";
  }
}

/** Monday-anchored week key (yyyy-MM-dd of the week's Monday). */
export function getWeekKey(date: Date): string {
  const ws = startOfWeek(date, { weekStartsOn: 1 });
  return format(ws, "yyyy-MM-dd");
}

/** "dd/MM" formatted date or em-dash for null. */
export function shortDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM");
}

/**
 * Pick the dominant stage code + status for a cell that overlaps
 * one or more jobs.
 *
 * Returns null if no jobs overlap. Otherwise concatenates up to 3
 * unique stage codes joined by "/" ("BRI/SCA/+2" for >3). Cell
 * colour comes from the dominant job (lowest STATUS_PRIORITY +
 * stable sortOrder).
 *
 * Pre-fix (Keith May 2026: "the download PDF doesn't match the
 * programme") the function used a first-match-wins loop that
 * silently dropped parallel sub-jobs after the first. Now every
 * overlap participates in the dominant pick.
 */
export function getJobStageForCell(
  jobs: ProgrammeJob[],
  cellDate: Date,
  cellEnd: Date,
): { code: string; status: string } | null {
  // (May 2026 Keith bug report) Skip weekend cells entirely.
  // Construction work is working-day. A job that runs Thu→Tue
  // (4 working days = Thu, Fri, Mon, Tue) shouldn't paint Sat/Sun
  // bars. Pre-fix the calendar-day overlap check painted them.
  // Day-view cells span 1 day, so isWeekend on cellDate is the
  // signal. Week-view cells span 7 days starting Monday so they're
  // never wholly weekend.
  if (isWeekend(cellDate) && cellEnd.getTime() - cellDate.getTime() <= 86_400_000 + 1) {
    return null;
  }
  const overlaps: ProgrammeJob[] = [];
  for (const job of jobs) {
    if (!job.startDate || !job.endDate) continue;
    const jobStart = new Date(job.startDate);
    const jobEnd = new Date(job.endDate);
    if (jobStart < cellEnd && jobEnd >= cellDate) {
      overlaps.push(job);
    }
  }
  if (overlaps.length === 0) return null;

  overlaps.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const dominant = overlaps[0];
  const codes: string[] = [];
  for (const j of overlaps) {
    const c = getStageCode(j);
    if (c && !codes.includes(c)) codes.push(c);
  }
  let code = codes.slice(0, 3).join("/");
  if (codes.length > 3) {
    code = `${codes.slice(0, 3).join("/")}+${codes.length - 3}`;
  }

  return { code: code || getStageCode(dominant), status: dominant.status };
}

/**
 * Render the "active stage" pill label for a plot.
 *
 * Routes through the unified `getCurrentStage` SSOT helper so this
 * matches Walkthrough, Daily Brief, and Plot Detail. When every
 * job is COMPLETED, returns "Complete" (May 2026 audit B-P1-24) —
 * pre-fix the cell showed the last job's name on a fully-done plot.
 */
export function getActiveStageLabel(plot: ProgrammePlot): string {
  if (
    plot.jobs.length > 0 &&
    plot.jobs.every((j) => j.status === "COMPLETED")
  ) {
    return "Complete";
  }
  const stage = getCurrentStage(plot.jobs);
  if (!stage) return "—";
  return getStageCode(stage);
}

/** "#aabbcc" → [r, g, b] integers. Returns [0,0,0] on parse fail. */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/** Dominant status for a plot's jobs. NONE means zero jobs. */
export function getPlotStatus(plot: ProgrammePlot): string {
  if (plot.jobs.length === 0) return "NONE";
  if (plot.jobs.some((j) => j.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (plot.jobs.every((j) => j.status === "COMPLETED")) return "COMPLETED";
  if (plot.jobs.some((j) => j.status === "ON_HOLD")) return "ON_HOLD";
  return "NOT_STARTED";
}
