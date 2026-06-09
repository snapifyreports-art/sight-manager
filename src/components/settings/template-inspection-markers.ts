import type { TemplateJobData, TemplateInspectionData } from "./types";

/**
 * Pure helpers for plotting template inspection "!" markers on the
 * timeline previews (desktop TemplateTimeline + mobile
 * TemplateMobileTimeline). The template programme is week-based, so an
 * inspection's marker week is derived from its anchor job's week + the
 * working-day offset (5 working days = 1 week). This mirrors the on-plot
 * Gantt markers so authoring and live views read identically.
 */

export interface InspectionMarker {
  id: string;
  name: string;
  type: string;
  /** Week the marker lands on (same 1-indexed scale as TemplateJobData.startWeek). */
  week: number;
  /** Whole working-day position within the programme (week→day at 5/week). */
  day: number;
  anchorJobId: string;
  /** Human label, e.g. "end +5d" / "start". */
  edgeLabel: string;
}

/** Flatten stages + their children into an id→job lookup. */
function flattenJobs(jobs: TemplateJobData[]): Map<string, TemplateJobData> {
  const m = new Map<string, TemplateJobData>();
  const walk = (list: TemplateJobData[]) => {
    for (const j of list) {
      m.set(j.id, j);
      if (j.children?.length) walk(j.children);
    }
  };
  walk(jobs);
  return m;
}

export function computeInspectionMarkers(
  jobs: TemplateJobData[],
  inspections: TemplateInspectionData[],
): InspectionMarker[] {
  const map = flattenJobs(jobs);
  const out: InspectionMarker[] = [];
  for (const ins of inspections) {
    const anchor = map.get(ins.anchorTemplateJobId);
    if (!anchor) continue;
    const offsetDays = ins.offsetDays || 0;
    const isEnd = ins.anchorEdge === "END";
    const edgeWeek = isEnd ? anchor.endWeek : anchor.startWeek;
    const week = edgeWeek + Math.round(offsetDays / 5);
    // Day position: week N occupies working days (N-1)*5 .. N*5-1. The
    // edge day is the last working day of endWeek, or first of startWeek.
    const edgeDay = isEnd ? anchor.endWeek * 5 - 1 : (anchor.startWeek - 1) * 5;
    const day = edgeDay + offsetDays;
    out.push({
      id: ins.id,
      name: ins.name,
      type: ins.type,
      week,
      day,
      anchorJobId: ins.anchorTemplateJobId,
      edgeLabel: `${isEnd ? "end" : "start"}${offsetDays ? ` ${offsetDays > 0 ? "+" : ""}${offsetDays}d` : ""}`,
    });
  }
  return out;
}
