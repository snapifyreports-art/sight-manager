/**
 * Single source of truth for "what stage is this plot at?"
 *
 * Pre-May 2026 audit there were 4 different implementations across
 * SiteProgramme, walkthrough, daily-brief, plot-detail — each used
 * its own slightly different rule, so the same plot could show 4
 * different stage labels depending on which view loaded. This helper
 * unifies the logic.
 *
 * Rule (Keith confirmed May 2026):
 *   - IN_PROGRESS exists → that stage's name
 *   - All COMPLETED → null (caller renders "Complete")
 *   - Mix of COMPLETED + NOT_STARTED → first NOT_STARTED stage ("next up")
 *   - All NOT_STARTED → first stage
 *   - No jobs → null
 *
 * ON_HOLD jobs count as IN_PROGRESS for "currently active" detection
 * (the stage IS in motion, just paused). Edge case: if there are
 * multiple IN_PROGRESS jobs (parallel sub-jobs), the lowest-sortOrder
 * one wins so the result is deterministic.
 *
 * (May 2026 audit B-P1-24) Pre-fix this function returned the
 * last-COMPLETED job when every job was COMPLETED, but
 * `getCurrentStageLabel` returned the string "Complete" for the same
 * input — so a direct caller showed e.g. "Snagging" for a fully done
 * plot while a label caller showed "Complete". They now agree:
 * getCurrentStage returns null when all-complete (signal to the
 * caller to render its own "Complete" affordance), and
 * getCurrentStageLabel keeps emitting "Complete".
 */

interface StageJob {
  name: string;
  status: string;
  sortOrder: number;
}

export function getCurrentStage<T extends StageJob>(jobs: T[]): T | null {
  if (jobs.length === 0) return null;

  // Stable order — caller might have already sorted, but be defensive.
  const sorted = [...jobs].sort((a, b) => a.sortOrder - b.sortOrder);

  // Active first — IN_PROGRESS or ON_HOLD means "this is where we are".
  const active = sorted.find(
    (j) => j.status === "IN_PROGRESS" || j.status === "ON_HOLD",
  );
  if (active) return active;

  // Any not-started job? Return the first one in order — that's "next up".
  const upcoming = sorted.find((j) => j.status === "NOT_STARTED");
  if (upcoming) return upcoming;

  // Everything COMPLETED (or zero jobs) — return null. Callers should
  // render "Complete" / their own end-of-build affordance. Returning
  // the last-completed job confused callers that needed a "this is
  // where we are now" signal.
  return null;
}

/** Convenience: just the label string. Returns "Complete" when every
 *  job is COMPLETED, falls back to "—" if there are no jobs. */
export function getCurrentStageLabel<T extends StageJob>(jobs: T[]): string {
  if (jobs.length === 0) return "—";
  const allComplete = jobs.every((j) => j.status === "COMPLETED");
  if (allComplete) return "Complete";
  const stage = getCurrentStage(jobs);
  return stage?.name ?? "—";
}
