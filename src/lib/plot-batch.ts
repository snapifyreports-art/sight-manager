/**
 * Shared plot-batch helpers — the single source of truth for the
 * "create N plots from a template" maths used by BOTH the new-site wizard
 * (CreateSiteWizard) and the add-plot-to-live-site dialog (SiteDetailClient).
 *
 * (Jun 2026 Keith field report) These two flows had drifted: the wizard
 * grew a per-plot stagger / different-start-date feature that the live-site
 * bulk-add dialog never got, so bulk-adding plots to an existing site
 * couldn't stagger crews the way new-site batches could. Extracting the
 * maths here means the two callers can never disagree again — fix the
 * stagger once, both flows get it.
 */
import { format } from "date-fns";
import { addWorkingDays } from "@/lib/working-days";

export interface PlotBatchPlot {
  plotNumber: string;
  /** Per-plot start date (ISO yyyy-mm-dd). Computed from the batch
   *  start date + stagger by default; the user can override per row. */
  startDate: string;
}

/**
 * Parse a plot-numbers input string into an array.
 *
 * Accepts:
 *   - "1-20"                → ["1","2",...,"20"] (integer range shortcut)
 *   - "47-A, 47-B, 50"      → as-is (comma list, any strings)
 *   - "1-5, 10, 12-14"      → mixed: ["1","2","3","4","5","10","12","13","14"]
 *   - Whitespace trimmed, empty entries skipped
 *
 * Returns errors for: invalid ranges, ranges too large (>500), duplicates.
 * A-Z range syntax ("A-E") is NOT expanded — it's treated as a literal
 * single plot number, which is almost certainly what the user intended.
 */
export function parsePlotNumbers(input: string): {
  numbers: string[];
  errors: string[];
} {
  const parts = input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const raw: string[] = [];
  const errors: string[] = [];
  for (const part of parts) {
    // Only expand integer-integer ranges. "47-A" is treated as a literal
    // (hyphen is valid in plot numbers, e.g. "47-A" or "Phase-2-Block-12").
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (end < start) {
        errors.push(`"${part}": end must be ≥ start`);
        continue;
      }
      if (end - start > 499) {
        errors.push(
          `"${part}": range too large (${end - start + 1} plots, max 500)`,
        );
        continue;
      }
      for (let i = start; i <= end; i++) raw.push(String(i));
    } else {
      raw.push(part);
    }
  }
  // Dedupe inside the batch
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const numbers: string[] = [];
  for (const n of raw) {
    if (seen.has(n)) dupes.add(n);
    else {
      seen.add(n);
      numbers.push(n);
    }
  }
  if (dupes.size > 0) errors.push(`Duplicates: ${[...dupes].join(", ")}`);
  return { numbers, errors };
}

/**
 * Compute per-plot start dates for a batch.
 *
 *   - Plot 1 always = batchStartDate (raw, no snap — the apply-template
 *     endpoint snaps to a working day on commit if needed).
 *   - Each subsequent plot is offset by `staggerDays` working days from
 *     the previous plot's date. 0 = all plots same date.
 *   - Pinned overrides (rows the user manually edited) take precedence
 *     over the computed value.
 */
export function deriveBatchPlotDates(
  numbers: string[],
  batchStartDate: string,
  staggerDays: number,
  overrides: Record<string, string>,
): PlotBatchPlot[] {
  return numbers.map((num, idx) => {
    if (overrides[num]) {
      return { plotNumber: num, startDate: overrides[num] };
    }
    if (!batchStartDate) {
      return { plotNumber: num, startDate: "" };
    }
    if (idx === 0 || staggerDays <= 0) {
      return { plotNumber: num, startDate: batchStartDate };
    }
    // Working-day offset from plot 1 (idx * staggerDays).
    const baseDate = new Date(batchStartDate + "T00:00:00");
    const shifted = addWorkingDays(baseDate, idx * staggerDays);
    return { plotNumber: num, startDate: format(shifted, "yyyy-MM-dd") };
  });
}
