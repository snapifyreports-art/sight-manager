"use client";

/**
 * Per-plot date editor — a small table that shows once the user has
 * entered both plot numbers and a batch start date. Each row's date
 * defaults to (batchStart + plotIndex × stagger) but can be manually
 * overridden. Manually-set rows are "pinned" until cleared via Reset.
 *
 * Shared by CreateSiteWizard (new-site batches) and SiteDetailClient
 * (add-plots-to-live-site bulk flow) so the two stagger UIs can't drift.
 *
 * Pinning + auto-fill:
 *   - Plot 1 always tracks batchStart unless pinned.
 *   - Subsequent plots track (batchStart + idx × stagger) unless pinned.
 *   - Editing the start date or stagger clears all pins (handled in
 *     the parent so the auto-filled column resets predictably).
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePlotNumbers, deriveBatchPlotDates } from "@/lib/plot-batch";

export function PerPlotDateEditor({
  input,
  startDate,
  staggerDays,
  overrides,
  onOverrideChange,
  onResetAll,
}: {
  input: string;
  startDate: string;
  staggerDays: number;
  overrides: Record<string, string>;
  onOverrideChange: (plotNumber: string, date: string) => void;
  onResetAll: () => void;
}) {
  const { numbers, errors } = parsePlotNumbers(input);
  if (errors.length > 0 || numbers.length === 0 || !startDate) return null;

  const plots = deriveBatchPlotDates(numbers, startDate, staggerDays, overrides);
  const pinnedCount = Object.keys(overrides).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          Per-plot start dates{" "}
          <span className="text-[10px] font-normal text-muted-foreground">
            ({plots.length} plot{plots.length === 1 ? "" : "s"}
            {pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ""})
          </span>
        </Label>
        {pinnedCount > 0 && (
          <button
            type="button"
            onClick={onResetAll}
            className="text-[10px] font-medium text-blue-600 hover:underline"
          >
            Reset all to auto
          </button>
        )}
      </div>
      <div className="max-h-[180px] space-y-1 overflow-y-auto rounded border bg-white/60 p-1.5">
        {plots.map((p) => {
          const pinned = !!overrides[p.plotNumber];
          return (
            <div
              key={p.plotNumber}
              className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-xs ${
                pinned ? "bg-blue-50/60" : ""
              }`}
            >
              <span className="w-12 shrink-0 font-medium">
                Plot {p.plotNumber}
              </span>
              <Input
                type="date"
                value={p.startDate}
                onChange={(e) =>
                  onOverrideChange(p.plotNumber, e.target.value)
                }
                className="h-7 flex-1 text-xs"
              />
              {pinned && (
                <button
                  type="button"
                  onClick={() => onOverrideChange(p.plotNumber, "")}
                  className="text-[10px] text-muted-foreground hover:text-blue-600"
                  title="Clear pin and auto-fill"
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
