/**
 * THE CANONICAL job-timeline helper. Every view that needs to know
 * "where does each job sit on the timeline" — Critical Path, Plot
 * Detail Gantt, Site Programme cells, Cash Flow remap, Site Story,
 * Handover ZIP plot stories — calls this. No view is allowed to
 * compute its own bar positions or durations from raw dates.
 *
 * Why: every time a feature did its own `differenceInDays(...)` or
 * its own `Math.min(...startDates)`, it got one tiny detail wrong
 * (calendar vs working days, parents vs leaves, fallback for null
 * actuals, etc.) and we shipped another stale-data bug. This helper
 * is the single source of truth for canonical timeline arithmetic.
 *
 * Returns three timelines per job:
 *   - planned   — current plan (what cascade reflects)
 *   - original  — baseline at first-shift (or apply-template time)
 *   - actual    — real start/end if work has happened (else null)
 *
 * Each timeline carries: { start, end, durationDays, offsetFromStart }.
 * `durationDays` and `offsetFromStart` are WORKING days. `offsetFromStart`
 * is relative to the plot's anchor (the earliest planned start across
 * all leaf jobs).
 *
 * Callers explicitly pick which timeline to render. There is no
 * default mode — explicitness is what kills the class of bug.
 *
 * Helper rules:
 *   - All durations + offsets are WORKING days (matches addWorkingDays
 *     / differenceInWorkingDays everywhere else).
 *   - Floor durations at 1 working day so a same-day job still draws.
 *   - Plot anchor = earliest planned startDate of any LEAF job. Parent
 *     rollups use the same anchor as their children — they don't
 *     contribute to anchor selection.
 *   - Jobs with null startDate/endDate are excluded from output (caller
 *     can render an "unscheduled" badge separately if needed).
 *   - originalStartDate / originalEndDate are NOT NULL on the schema
 *     (May 2026 audit), so the original timeline is always available.
 *   - actualStartDate / actualEndDate are nullable; if BOTH null, the
 *     actual timeline is null. If only one is set (job started, not
 *     finished), actual.end is null and actual.durationDays is null.
 */

import { differenceInWorkingDays } from "@/lib/working-days";

/**
 * (May 2026 audit #13 — helper migrations) Remap a date from the
 * current-plan timeline back onto the original-plan timeline. Used
 * by Cash Flow (when the user picks "original" date mode) so a
 * delayed order's spend bucket is shown at the date it would have
 * fallen on if nothing had slipped.
 *
 * Algorithm: how far through the current window does the date sit?
 * Drop it the same fraction through the original window. Clamped
 * so dates outside either window can't blow up.
 *
 * Lives here so every consumer that needs original-mode remapping
 * hits the same code path — Cash Flow, Site Story variance, future
 * Handover budget PDF.
 */
export function remapDateToOriginal(
  date: Date,
  jobStart: Date,
  jobEnd: Date,
  origStart: Date,
  origEnd: Date,
): Date {
  const jobSpan = jobEnd.getTime() - jobStart.getTime();
  const origSpan = origEnd.getTime() - origStart.getTime();
  if (jobSpan <= 0 || origSpan <= 0) return date;
  const fraction = (date.getTime() - jobStart.getTime()) / jobSpan;
  const clamped = Math.max(0, Math.min(1, fraction));
  return new Date(origStart.getTime() + clamped * origSpan);
}

// ── Input shapes ─────────────────────────────────────────────────────
// Caller passes the bare minimum needed; helper doesn't query the DB.

export interface TimelineJobInput {
  id: string;
  name: string;
  status: string;
  sortOrder: number;
  parentId: string | null;
  parentStage: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  originalStartDate: Date | string;
  originalEndDate: Date | string;
  actualStartDate: Date | string | null;
  actualEndDate: Date | string | null;
  weatherAffected?: boolean;
  // Optional richer fields the caller can pipe through. Helper passes
  // them back unchanged on the output shape.
  stageCode?: string | null;
  assignee?: string | null;
}

// ── Output shapes ────────────────────────────────────────────────────

export interface TimelineRange {
  start: Date;
  end: Date;
  durationDays: number; // working days
  offsetFromStart: number; // working days from plot anchor
}

export interface PartialTimelineRange {
  start: Date | null;
  end: Date | null;
  durationDays: number | null; // null while the range is open-ended
  offsetFromStart: number | null;
}

export interface TimelineJob {
  id: string;
  name: string;
  status: string;
  sortOrder: number;
  parentId: string | null;
  parentStage: string | null;
  isLeaf: boolean;
  weatherAffected: boolean;
  stageCode: string | null;
  assignee: string | null;

  planned: TimelineRange;
  original: TimelineRange;
  // Null when no work has started yet. Partial when started but not
  // finished (end + durationDays null).
  actual: PartialTimelineRange | null;
}

export interface JobTimeline {
  /** Earliest planned start across all leaf jobs (or fallback when none). */
  plotStart: Date;
  /** Latest planned end across all leaf jobs. */
  plotEnd: Date;
  /** Plot length in working days from plotStart to plotEnd. */
  totalWorkingDays: number;
  /** Same set of input jobs, with timeline data attached. Sorted by sortOrder. */
  jobs: TimelineJob[];
  /** Convenience: only the leaves, in sortOrder. */
  leafJobs: TimelineJob[];
  /** Convenience: only the parents (children: { some: {} }), in sortOrder. */
  parentJobs: TimelineJob[];
}

// ── Implementation ───────────────────────────────────────────────────

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function toDateOrNull(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

function workingDuration(start: Date, end: Date): number {
  // Floor at 1 so a zero-or-negative range still draws as a single
  // working day. addWorkingDays semantics: a job that runs Mon→Mon
  // is 1 working day of work, not zero.
  return Math.max(1, differenceInWorkingDays(end, start));
}

/**
 * Build the canonical timeline for a set of jobs.
 *
 * @param inputs Jobs as they sit on the plot, in any order (helper
 *   sorts by sortOrder internally).
 */
export function buildJobTimeline(inputs: TimelineJobInput[]): JobTimeline {
  // Filter out jobs with no planned dates — caller can surface them
  // as "unscheduled" with a separate UI affordance.
  const scheduled = inputs.filter(
    (j) => j.startDate != null && j.endDate != null,
  );

  if (scheduled.length === 0) {
    const epoch = new Date(0);
    return {
      plotStart: epoch,
      plotEnd: epoch,
      totalWorkingDays: 0,
      jobs: [],
      leafJobs: [],
      parentJobs: [],
    };
  }

  // isLeaf = no other job has parentId === this.id
  const childCount = new Map<string, number>();
  for (const j of scheduled) {
    if (j.parentId) {
      childCount.set(j.parentId, (childCount.get(j.parentId) ?? 0) + 1);
    }
  }
  const isLeaf = (jobId: string) => (childCount.get(jobId) ?? 0) === 0;

  // Plot anchor = earliest planned start across LEAF jobs (real work).
  // Parents inherit the anchor. If for some reason there are no
  // leaves, fall back to earliest across all scheduled jobs.
  const leaves = scheduled.filter((j) => isLeaf(j.id));
  const anchorPool = leaves.length > 0 ? leaves : scheduled;
  let plotStart = toDate(anchorPool[0].startDate!);
  let plotEnd = toDate(anchorPool[0].endDate!);
  for (const j of anchorPool) {
    const s = toDate(j.startDate!);
    const e = toDate(j.endDate!);
    if (s < plotStart) plotStart = s;
    if (e > plotEnd) plotEnd = e;
  }
  const totalWorkingDays = workingDuration(plotStart, plotEnd);

  // Build per-job output, sorted by sortOrder for stable display.
  const sorted = [...scheduled].sort((a, b) => a.sortOrder - b.sortOrder);
  const jobs: TimelineJob[] = sorted.map((j) => {
    const plannedStart = toDate(j.startDate!);
    const plannedEnd = toDate(j.endDate!);
    const originalStart = toDate(j.originalStartDate);
    const originalEnd = toDate(j.originalEndDate);
    const actualStart = toDateOrNull(j.actualStartDate);
    const actualEnd = toDateOrNull(j.actualEndDate);

    const planned: TimelineRange = {
      start: plannedStart,
      end: plannedEnd,
      durationDays: workingDuration(plannedStart, plannedEnd),
      offsetFromStart: Math.max(
        0,
        differenceInWorkingDays(plannedStart, plotStart),
      ),
    };
    const original: TimelineRange = {
      start: originalStart,
      end: originalEnd,
      durationDays: workingDuration(originalStart, originalEnd),
      offsetFromStart: Math.max(
        0,
        differenceInWorkingDays(originalStart, plotStart),
      ),
    };

    // Actual: null when no work started. Partial when started but
    // not finished — durationDays + end are null because the range
    // is still open (current date is misleading; let the caller
    // decide how to render an in-progress bar).
    let actual: PartialTimelineRange | null = null;
    if (actualStart || actualEnd) {
      const offset = actualStart
        ? Math.max(0, differenceInWorkingDays(actualStart, plotStart))
        : null;
      const dur =
        actualStart && actualEnd ? workingDuration(actualStart, actualEnd) : null;
      actual = {
        start: actualStart,
        end: actualEnd,
        durationDays: dur,
        offsetFromStart: offset,
      };
    }

    return {
      id: j.id,
      name: j.name,
      status: j.status,
      sortOrder: j.sortOrder,
      parentId: j.parentId,
      parentStage: j.parentStage,
      isLeaf: isLeaf(j.id),
      weatherAffected: j.weatherAffected ?? false,
      stageCode: j.stageCode ?? null,
      assignee: j.assignee ?? null,
      planned,
      original,
      actual,
    };
  });

  return {
    plotStart,
    plotEnd,
    totalWorkingDays,
    jobs,
    leafJobs: jobs.filter((j) => j.isLeaf),
    parentJobs: jobs.filter((j) => !j.isLeaf),
  };
}

/**
 * Convenience: convert a TimelineRange to the legacy { duration,
 * earlyStart, earlyFinish } shape that older endpoints used. Lets us
 * migrate one consumer at a time without changing API contracts.
 */
export function legacyTimelineFields(range: TimelineRange) {
  return {
    duration: range.durationDays,
    earlyStart: range.offsetFromStart,
    earlyFinish: range.offsetFromStart + range.durationDays,
  };
}
