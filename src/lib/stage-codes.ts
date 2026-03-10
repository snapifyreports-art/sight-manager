/**
 * Stage code utilities for the programme view.
 * Stage codes are configurable per template job (e.g. FND, DPC, B1, B2, RF, RT, FX1, PLS, FX2, PNT, FNL, CML).
 */

// Get the display stage code for a job
export function getStageCode(job: {
  stageCode?: string | null;
  name: string;
}): string {
  if (job.stageCode) return job.stageCode;
  // Auto-abbreviate: take first 3 chars uppercase
  return job.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
}

// Stage colors by job status
const STAGE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_STARTED: { bg: "#e2e8f0", text: "#475569" }, // slate
  IN_PROGRESS: { bg: "#dbeafe", text: "#1d4ed8" }, // blue
  ON_HOLD: { bg: "#fef3c7", text: "#b45309" }, // amber
  COMPLETED: { bg: "#dcfce7", text: "#15803d" }, // green
};

export function getStageColor(status: string) {
  return STAGE_STATUS_COLORS[status] ?? STAGE_STATUS_COLORS.NOT_STARTED;
}
