"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { addWorkingDays } from "@/lib/working-days";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Calendar,
  Briefcase,
  Layers,
  LayoutTemplate,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { usePlotCreation } from "@/hooks/usePlotCreation";
import { HelpTip } from "@/components/shared/HelpTip";

// ---------- Types ----------

interface TemplateOrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface TemplateOrder {
  id: string;
  itemsDescription: string | null;
  orderWeekOffset: number;
  deliveryWeekOffset: number;
  items: TemplateOrderItem[];
}

interface TemplateJob {
  id: string;
  name: string;
  description: string | null;
  startWeek: number;
  endWeek: number;
  orders: TemplateOrder[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  typeLabel: string | null;
  jobs: TemplateJob[];
}

interface Supplier {
  id: string;
  name: string;
}

interface PlotBatchPlot {
  plotNumber: string;
  /** Per-plot start date (ISO yyyy-mm-dd). Computed from the batch
   *  start date + stagger by default; user can override per row. */
  startDate: string;
}

interface PlotBatch {
  id: string;
  mode: "blank" | "template";
  /** Per-plot rows with their own start dates. Replaces the May 2026
   *  flat (plotNumbers + single startDate) shape — Keith hit the
   *  limitation when staggering brickwork crew across plots and when
   *  mixing pre-sold + on-contract plots in one logical group. */
  plots: PlotBatchPlot[];
  templateId: string;
  /** Optional variant id — when set, the variant's full template is
   *  applied per plot rather than the base. Empty = base template. */
  variantId: string;
  templateName: string;
  variantName?: string;
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
function parsePlotNumbers(input: string): { numbers: string[]; errors: string[] } {
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
        errors.push(`"${part}": range too large (${end - start + 1} plots, max 500)`);
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

/** Compact label for a batch row. Collapses long consecutive-integer runs. */
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
function deriveBatchPlotDates(
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

/**
 * Per-plot date editor — a small table that shows once the user has
 * entered both plot numbers and a batch start date. Each row's date
 * defaults to (batchStart + plotIndex × stagger) but can be manually
 * overridden. Manually-set rows are "pinned" until cleared via Reset.
 *
 * Pinning + auto-fill:
 *   - Plot 1 always tracks batchStart unless pinned.
 *   - Subsequent plots track (batchStart + idx × stagger) unless pinned.
 *   - Editing the start date or stagger clears all pins (handled in
 *     the parent so the auto-filled column resets predictably).
 */
function PerPlotDateEditor({
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

function batchLabel(nums: string[]): string {
  if (nums.length === 0) return "No plots";
  if (nums.length === 1) return `Plot ${nums[0]}`;
  // If all numbers are consecutive pure integers starting from nums[0], collapse.
  const allInts = nums.every((n) => /^\d+$/.test(n));
  if (allInts) {
    const ints = nums.map((n) => parseInt(n, 10));
    const consecutive = ints.every((v, i) => i === 0 || v === ints[i - 1] + 1);
    if (consecutive) return `Plots ${ints[0]}–${ints[ints.length - 1]}`;
  }
  if (nums.length <= 4) return `Plots ${nums.join(", ")}`;
  return `Plots ${nums.slice(0, 3).join(", ")} +${nums.length - 3} more`;
}

interface CreatedSite {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { plots: number };
}

type WizardStep = "site-details" | "plot-batches" | "supplier-mapping";

// ---------- Component ----------

export function CreateSiteWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (site: CreatedSite) => void;
}) {
  // Step
  const [step, setStep] = useState<WizardStep>("site-details");

  // Step 1: Site details
  const [siteName, setSiteName] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [siteManagerId, setSiteManagerId] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load users"));
          return;
        }
        const data: { id: string; name: string }[] = await res.json();
        setUsers(data.map((u) => ({ id: u.id, name: u.name })));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load users");
      }
    })();
  }, [toast]);

  // Step 2: Plot batches
  const [plotBatches, setPlotBatches] = useState<PlotBatch[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [batchMode, setBatchMode] = useState<"blank" | "template">("template");
  // Free-form plot numbers input — supports ranges, comma lists, alphanumeric.
  // Parsed via parsePlotNumbers() into batch.plotNumbers.
  const [batchPlotNumbersInput, setBatchPlotNumbersInput] = useState("");
  const [batchTemplateId, setBatchTemplateId] = useState("");
  const [batchVariantId, setBatchVariantId] = useState("");
  const [batchVariants, setBatchVariants] = useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);
  const [batchStartDate, setBatchStartDate] = useState("");
  // Stagger between consecutive plots in a batch (working days).
  // 0 = all plots start on batchStartDate. 5 = each plot is 1 working
  // week after the previous. Plot 1 always = batchStartDate.
  const [batchStaggerDays, setBatchStaggerDays] = useState<number>(0);
  // Per-plot date overrides — when the user edits a specific row's
  // date, that row is "pinned" here. Keyed by plot number. Computed
  // dates ignore pinned rows; only unpinned rows recompute when
  // start-date or stagger changes.
  const [batchPlotDates, setBatchPlotDates] = useState<Record<string, string>>(
    {},
  );
  const [batchError, setBatchError] = useState("");

  // Templates & suppliers
  const [templates, setTemplates] = useState<Template[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Step 3: Supplier mappings
  const [supplierMappings, setSupplierMappings] = useState<
    Record<string, string>
  >({});

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [error, setError] = useState("");

  // Shared plot creation hook — used for the batch step. Same endpoints
  // and behaviour as SiteDetailClient so you learn one flow.
  const { createBlankBatch, createBatchFromTemplate } = usePlotCreation();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("site-details");
      setSiteName("");
      setSiteDescription("");
      setSiteLocation("");
      setSiteAddress("");
      setSitePostcode("");
      setPlotBatches([]);
      setShowAddForm(false);
      resetBatchForm();
      setSupplierMappings({});
      setSubmitting(false);
      setSubmitProgress("");
      setError("");
    }
  }, [open]);

  // Fetch templates when entering step 2
  useEffect(() => {
    if (step === "plot-batches" && templates.length === 0) {
      setLoadingTemplates(true);
      Promise.all([
        fetch("/api/plot-templates?liveOnly=true").then(async (r) => {
          if (!r.ok) throw new Error(await fetchErrorMessage(r, "Failed to load plot templates"));
          return r.json();
        }),
        fetch("/api/suppliers").then(async (r) => {
          if (!r.ok) throw new Error(await fetchErrorMessage(r, "Failed to load suppliers"));
          return r.json();
        }),
      ])
        .then(([tpls, sups]) => {
          setTemplates(tpls);
          setSuppliers(sups);
        })
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Failed to load templates and suppliers");
        })
        .finally(() => setLoadingTemplates(false));
    }
  }, [step, templates.length, toast]);

  function resetBatchForm() {
    setBatchMode("template");
    setBatchPlotNumbersInput("");
    setBatchTemplateId("");
    setBatchVariantId("");
    setBatchVariants([]);
    setBatchStartDate("");
    setBatchStaggerDays(0);
    setBatchPlotDates({});
    setBatchError("");
  }

  // Plot numbers already claimed by other batches — string-level uniqueness
  // since plot numbers can be alphanumeric ("47-A", "Block 2").
  const claimedNumbers = new Set<string>(
    plotBatches.flatMap((b) => b.plots.map((p) => p.plotNumber))
  );

  function handleAddBatch() {
    setBatchError("");

    const { numbers, errors } = parsePlotNumbers(batchPlotNumbersInput);
    if (errors.length > 0) {
      setBatchError(errors.join(" · "));
      return;
    }
    if (numbers.length === 0) {
      setBatchError("Enter at least one plot number (e.g. \"1-20\" or \"47-A, 48\").");
      return;
    }

    // Cross-batch duplicate check
    const overlap = numbers.filter((n) => claimedNumbers.has(n));
    if (overlap.length > 0) {
      setBatchError(
        `Already in another group: ${overlap.slice(0, 5).join(", ")}${overlap.length > 5 ? "…" : ""}`
      );
      return;
    }

    if (batchMode === "template") {
      if (!batchTemplateId) {
        setBatchError("Select a template.");
        return;
      }
      if (!batchStartDate) {
        setBatchError("Select a start date.");
        return;
      }
    }

    const tpl = templates.find((t) => t.id === batchTemplateId);
    const variantName = batchVariantId
      ? batchVariants.find((v) => v.id === batchVariantId)?.name
      : undefined;

    const plots = deriveBatchPlotDates(
      numbers,
      batchStartDate,
      batchStaggerDays,
      batchPlotDates,
    );

    setPlotBatches((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        mode: batchMode,
        plots,
        templateId: batchTemplateId,
        variantId: batchVariantId,
        templateName: tpl?.name ?? "",
        variantName,
      },
    ]);

    resetBatchForm();
    setShowAddForm(false);
  }

  function removeBatch(id: string) {
    setPlotBatches((prev) => prev.filter((b) => b.id !== id));
  }

  // Compute total plots
  const totalPlots = plotBatches.reduce((sum, b) => sum + b.plots.length, 0);

  // Check if any template batch has orders (needs supplier mapping)
  const templateBatchesWithOrders = plotBatches.filter((b) => {
    if (b.mode !== "template") return false;
    const tpl = templates.find((t) => t.id === b.templateId);
    return tpl?.jobs.some((j) => j.orders.length > 0);
  });

  const hasTemplateOrders = templateBatchesWithOrders.length > 0;

  // Get unique templates with orders for supplier mapping step
  const uniqueTemplatesWithOrders = (() => {
    const seen = new Set<string>();
    const result: { template: Template; batchLabels: string[] }[] = [];
    for (const batch of plotBatches) {
      if (batch.mode !== "template" || seen.has(batch.templateId)) continue;
      const tpl = templates.find((t) => t.id === batch.templateId);
      if (!tpl || !tpl.jobs.some((j) => j.orders.length > 0)) continue;
      seen.add(batch.templateId);
      const labels = plotBatches
        .filter((b) => b.templateId === batch.templateId)
        .map((b) => batchLabel(b.plots.map((p) => p.plotNumber)));
      result.push({ template: tpl, batchLabels: labels });
    }
    return result;
  })();

  // Selected template for the add form
  const selectedBatchTemplate = templates.find(
    (t) => t.id === batchTemplateId
  );

  // Build a pending batch from the open form (if valid), or return null.
  // Used when the user hits "Next" with an open form — we auto-commit the
  // pending batch so they don't lose their typed values.
  function buildPendingBatch(): PlotBatch | null {
    if (!showAddForm) return null;

    const { numbers, errors } = parsePlotNumbers(batchPlotNumbersInput);
    if (errors.length > 0 || numbers.length === 0) return null;
    // Overlap with already-committed batches
    if (numbers.some((n) => claimedNumbers.has(n))) return null;

    if (batchMode === "template" && (!batchTemplateId || !batchStartDate)) {
      return null;
    }

    const tpl = templates.find((t) => t.id === batchTemplateId);
    const variantName = batchVariantId
      ? batchVariants.find((v) => v.id === batchVariantId)?.name
      : undefined;
    const plots = deriveBatchPlotDates(
      numbers,
      batchStartDate,
      batchStaggerDays,
      batchPlotDates,
    );
    return {
      id: crypto.randomUUID(),
      mode: batchMode,
      plots,
      templateId: batchTemplateId,
      variantId: batchVariantId,
      templateName: tpl?.name ?? "",
      variantName,
    };
  }

  // Handle next from step 2
  function handleStep2Next() {
    // Auto-add any pending batch from the open form
    const pending = buildPendingBatch();
    if (pending) {
      const allBatches = [...plotBatches, pending];
      setPlotBatches(allBatches);
      resetBatchForm();
      setShowAddForm(false);
      // Check if any template batch has orders needing supplier mapping
      const needsSupplierMapping = allBatches.some((b) => {
        if (b.mode !== "template") return false;
        const tpl = templates.find((t) => t.id === b.templateId);
        return tpl?.jobs.some((j) => j.orders.length > 0);
      });
      if (needsSupplierMapping) {
        setStep("supplier-mapping");
      } else {
        handleSubmit(allBatches);
      }
      return;
    }
    if (showAddForm) {
      // Form is open but incomplete
      setBatchError("Please complete the plot group or cancel the form.");
      return;
    }
    if (hasTemplateOrders) {
      setStep("supplier-mapping");
    } else {
      handleSubmit();
    }
  }

  // Submit
  const handleSubmit = useCallback(async (batchesOverride?: PlotBatch[]) => {
    const batches = batchesOverride ?? plotBatches;
    setSubmitting(true);
    setError("");

    try {
      // Phase 1: Create site
      setSubmitProgress("Creating site...");
      const siteRes = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: siteName,
          description: siteDescription || null,
          location: siteLocation || null,
          address: siteAddress || null,
          postcode: sitePostcode || null,
          assignedToId: siteManagerId || null,
        }),
      });

      if (!siteRes.ok) {
        const err = await siteRes.json();
        throw new Error(err.error || "Failed to create site");
      }

      const createdSite = await siteRes.json();

      // Phase 2: Create plot batches
      const batchErrors: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const numbers = batch.plots.map((p) => p.plotNumber);
        const rangeLabel = batchLabel(numbers);
        setSubmitProgress(`Creating ${rangeLabel}...`);

        try {
          // Per-plot dates: each plot now carries its own startDate
          // (computed from batch start + stagger, or manually pinned).
          // The legacy single-date path still works on the server when
          // a plot row has no startDate — it falls back to body.startDate.
          const plots = batch.plots.map((p) => ({
            plotNumber: p.plotNumber,
            plotName: `Plot ${p.plotNumber}`,
            startDate: p.startDate || undefined,
          }));

          if (batch.mode === "blank") {
            // Chunked batch of blank plots via the shared hook (groups of 3
            // for Supabase pool limit — same behaviour as before).
            const res = await createBlankBatch({ siteId: createdSite.id, plots }, { silent: true });
            if (!res.ok) throw new Error(res.error ?? "Failed to create plots");
          } else {
            // Template batch via shared hook — one call to apply-template-batch.
            // First plot's date is the batch-level fallback for any plot
            // row that didn't carry its own.
            const res = await createBatchFromTemplate({
              siteId: createdSite.id,
              templateId: batch.templateId,
              variantId: batch.variantId || null,
              startDate: batch.plots[0]?.startDate ?? "",
              supplierMappings,
              plots,
            }, { silent: true });
            if (!res.ok) throw new Error(res.error ?? "Failed to create plots");
          }
        } catch (batchErr: unknown) {
          const msg =
            batchErr instanceof Error ? batchErr.message : "Unknown error";
          batchErrors.push(`${rangeLabel}: ${msg}`);
        }
      }

      // Re-fetch site to get updated _count after plots were created
      let finalSite = createdSite;
      try {
        const refreshRes = await fetch(`/api/sites/${createdSite.id}`);
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          finalSite = { ...createdSite, _count: refreshed._count ?? createdSite._count };
        }
      } catch {}

      if (batchErrors.length > 0) {
        setError(
          `Site created, but some plots failed:\n${batchErrors.join("\n")}`
        );
        onCreated(finalSite);
      } else {
        onCreated(finalSite);
        onOpenChange(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
    } finally {
      setSubmitting(false);
      setSubmitProgress("");
    }
  }, [
    siteName,
    siteDescription,
    siteLocation,
    siteAddress,
    sitePostcode,
    plotBatches,
    supplierMappings,
    siteManagerId,
    onCreated,
    onOpenChange,
  ]);

  const dialogWidth =
    step === "site-details" ? "sm:max-w-md" : "sm:max-w-lg";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogWidth}>
        <HelpTip title="About the Create Site wizard" anchor="below-left">
          <p><strong>Three steps:</strong> Site details → Plot batches → (if templates are used) Supplier mapping.</p>
          <p><strong>Step 1 — Site:</strong> name, address, postcode. These populate order emails, the header, and contractor-facing pages.</p>
          <p><strong>Step 2 — Plots:</strong> add one or more <em>batches</em> of plots. A batch = several plots that share the same template and start week. You can skip this if you&apos;d rather add plots one-by-one later.</p>
          <p><strong>Step 3 — Suppliers:</strong> only shown if a template you picked has orders with supplier placeholders. Assign real suppliers so orders are ready from day one.</p>
          <p><strong>You can close and come back:</strong> site creation isn&apos;t final until you hit Create on the last step. Nothing is saved until then.</p>
        </HelpTip>
        {/* Step indicator. `pr-10` keeps the rightmost StepDot clear of
            the dialog's absolute-positioned close (✕) button + the
            HelpTip (?) icon at top-right. Without it, "Suppliers" /
            "Plots" labels overlap those icons on narrow dialogs. */}
        <div className="flex items-center gap-2 pb-1 pr-10">
          <StepDot
            num={1}
            label="Site"
            active={step === "site-details"}
            done={step !== "site-details"}
          />
          <div className="h-px flex-1 bg-border" />
          <StepDot
            num={2}
            label="Plots"
            active={step === "plot-batches"}
            done={step === "supplier-mapping"}
          />
          {hasTemplateOrders && (
            <>
              <div className="h-px flex-1 bg-border" />
              <StepDot
                num={3}
                label="Suppliers"
                active={step === "supplier-mapping"}
                done={false}
              />
            </>
          )}
        </div>

        {/* ===== STEP 1: Site Details ===== */}
        {step === "site-details" && (
          <>
            <DialogHeader>
              <DialogTitle>Create Site</DialogTitle>
              <DialogDescription>
                Add a new construction site to manage plots and jobs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="wiz-site-name">Name</Label>
                <Input
                  id="wiz-site-name"
                  placeholder="e.g. Oakwood Park Development"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-site-desc">Description</Label>
                <Textarea
                  id="wiz-site-desc"
                  placeholder="Brief description of this site..."
                  value={siteDescription}
                  onChange={(e) => setSiteDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wiz-site-loc">Location</Label>
                  <Input
                    id="wiz-site-loc"
                    placeholder="e.g. Manchester"
                    value={siteLocation}
                    onChange={(e) => setSiteLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wiz-site-addr">Address</Label>
                  <Input
                    id="wiz-site-addr"
                    placeholder="e.g. 12 Oak Lane"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-site-postcode">Postcode</Label>
                <Input
                  id="wiz-site-postcode"
                  placeholder="e.g. SW1A 1AA"
                  value={sitePostcode}
                  onChange={(e) => setSitePostcode(e.target.value.toUpperCase())}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label>Site Manager</Label>
                <Select value={siteManagerId || "none"} onValueChange={(v) => setSiteManagerId(!v || v === "none" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unassigned">
                      {siteManagerId && siteManagerId !== "none"
                        ? users.find((u) => u.id === siteManagerId)?.name ?? "Loading..."
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={() => setStep("plot-batches")}
                disabled={!siteName.trim()}
              >
                Next: Add Plots
                <ChevronRight className="size-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ===== STEP 2: Plot Batches ===== */}
        {step === "plot-batches" && (
          <>
            <DialogHeader>
              <DialogTitle>Add Plots</DialogTitle>
              <DialogDescription>
                Define groups of plots. Each group can have its own start date
                and template.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {/* Batch list */}
              {plotBatches.length > 0 && (
                <div className="max-h-[30vh] space-y-2 overflow-y-auto">
                  {plotBatches.map((batch) => {
                    const count = batch.plots.length;
                    const numbers = batch.plots.map((p) => p.plotNumber);
                    // Date range: earliest → latest start across the batch.
                    const dates = batch.plots
                      .map((p) => p.startDate)
                      .filter(Boolean)
                      .sort();
                    const firstDate = dates[0] ?? "";
                    const lastDate = dates[dates.length - 1] ?? "";
                    const dateLabel = !firstDate
                      ? "no date"
                      : firstDate === lastDate
                        ? format(new Date(firstDate + "T00:00:00"), "d MMM yyyy")
                        : `${format(new Date(firstDate + "T00:00:00"), "d MMM")} → ${format(new Date(lastDate + "T00:00:00"), "d MMM yyyy")}`;
                    return (
                      <div
                        key={batch.id}
                        className="flex items-center gap-3 rounded-lg border bg-slate-50/50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Layers className="size-3.5 text-muted-foreground" />
                            {batchLabel(numbers)}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({count} {count === 1 ? "plot" : "plots"})
                            </span>
                          </div>
                          {/* Show all plot numbers on hover/expand if not collapsed. */}
                          {count > 4 && batchLabel(numbers).includes("more") && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70" title={numbers.join(", ")}>
                              {numbers.join(", ")}
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {batch.mode === "template" ? (
                              <>
                                <LayoutTemplate className="size-3" />
                                <span>
                                  {batch.templateName}
                                  {batch.variantName ? ` · ${batch.variantName}` : ""}
                                </span>
                                <span>&middot;</span>
                                <Calendar className="size-3" />
                                <span title={firstDate !== lastDate ? "Plots staggered across this range" : undefined}>
                                  {dateLabel}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="italic">Blank plots</span>
                                {firstDate && (
                                  <>
                                    <span>&middot;</span>
                                    <Calendar className="size-3" />
                                    <span>{dateLabel}</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeBatch(batch.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          title="Remove group"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inline add form */}
              {showAddForm ? (
                <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={
                        batchMode === "template" ? "default" : "outline"
                      }
                      onClick={() => setBatchMode("template")}
                      className="h-7 text-xs"
                    >
                      <LayoutTemplate className="size-3" />
                      From Template
                    </Button>
                    <Button
                      size="sm"
                      variant={batchMode === "blank" ? "default" : "outline"}
                      onClick={() => setBatchMode("blank")}
                      className="h-7 text-xs"
                    >
                      Blank
                    </Button>
                  </div>

                  {/* Plot numbers — free-form input. Accepts ranges, comma
                      lists, and alphanumeric plot numbers. */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Plot Numbers</Label>
                    <Input
                      type="text"
                      placeholder={"e.g.  1-20   or   47-A, 47-B, 48, 50   or   1-5, 10, 12-14"}
                      value={batchPlotNumbersInput}
                      onChange={(e) => setBatchPlotNumbersInput(e.target.value)}
                      className="h-8 text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Enter a range (<span className="font-mono">1-20</span>), a list
                      (<span className="font-mono">47-A, 48, 50</span>), or mix both.
                      {(() => {
                        const preview = parsePlotNumbers(batchPlotNumbersInput);
                        if (batchPlotNumbersInput.trim() === "") return null;
                        if (preview.errors.length > 0) {
                          return (
                            <span className="ml-1 font-medium text-red-600">{preview.errors[0]}</span>
                          );
                        }
                        return (
                          <span className="ml-1 font-medium text-emerald-700">
                            {preview.numbers.length} plot{preview.numbers.length === 1 ? "" : "s"} parsed
                          </span>
                        );
                      })()}
                    </p>
                  </div>

                  {/* Template selection */}
                  {batchMode === "template" && (
                    <>
                      {loadingTemplates ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          Loading templates...
                        </p>
                      ) : templates.length === 0 ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          No templates found. Create one in Settings first.
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Template</Label>
                            <Select
                              value={batchTemplateId}
                              onValueChange={(v) => {
                                if (v === null) return;
                                setBatchTemplateId(v);
                                setBatchVariantId("");
                                setBatchVariants([]);
                                // Lazy-fetch variants for this template
                                void fetch(
                                  `/api/plot-templates/${v}/variants`,
                                  { cache: "no-store" },
                                ).then(async (r) => {
                                  if (!r.ok) return;
                                  const data = await r.json();
                                  setBatchVariants(
                                    Array.isArray(data) ? data : [],
                                  );
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 w-full text-sm">
                                <SelectValue placeholder="Select a template">
                                  {selectedBatchTemplate
                                    ? `${selectedBatchTemplate.name}${selectedBatchTemplate.typeLabel ? ` (${selectedBatchTemplate.typeLabel})` : ""}`
                                    : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {templates.map((tpl) => (
                                  <SelectItem key={tpl.id} value={tpl.id}>
                                    {tpl.name}
                                    {tpl.typeLabel && ` (${tpl.typeLabel})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Variant picker — only when the chosen template
                              has variants. Defaults to "base" (no variant). */}
                          {batchTemplateId && batchVariants.length > 0 && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">
                                Variant{" "}
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  ({batchVariants.length} available)
                                </span>
                              </Label>
                              <Select
                                value={batchVariantId || "__base__"}
                                onValueChange={(v) =>
                                  setBatchVariantId(
                                    v === "__base__" ? "" : (v ?? ""),
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-full text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__base__">
                                    Use base template (no variant)
                                  </SelectItem>
                                  {batchVariants.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.name}
                                      {v.description ? ` — ${v.description}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {selectedBatchTemplate && (
                            <div className="rounded-md border bg-white/50 px-2.5 py-1.5">
                              <div className="flex items-center gap-2 text-xs">
                                <Briefcase className="size-3 text-muted-foreground" />
                                <span>
                                  {selectedBatchTemplate.jobs.length} jobs
                                </span>
                                <span className="text-muted-foreground">
                                  &middot;
                                </span>
                                <Calendar className="size-3 text-muted-foreground" />
                                <span>
                                  {selectedBatchTemplate.jobs.length > 0
                                    ? Math.max(
                                        ...selectedBatchTemplate.jobs.map(
                                          (j) => j.endWeek
                                        )
                                      )
                                    : 0}{" "}
                                  weeks
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Start Date</Label>
                              <Input
                                type="date"
                                value={batchStartDate}
                                onChange={(e) => {
                                  setBatchStartDate(e.target.value);
                                  // Editing the batch start clears any per-plot pins
                                  // so the staggered/auto-filled column resets
                                  // around the new date. Less surprising than
                                  // leaving stale pins behind.
                                  setBatchPlotDates({});
                                }}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label
                                className="text-xs"
                                title="Working-day gap between consecutive plots in this batch. 0 = all plots same date. 5 = each plot one working week after the previous."
                              >
                                Stagger (working days)
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={365}
                                value={batchStaggerDays}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setBatchStaggerDays(Number.isFinite(v) && v >= 0 ? v : 0);
                                  setBatchPlotDates({});
                                }}
                                placeholder="0"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>

                          {/* Per-plot date editor — visible once we have
                              numbers + a start date. Each row's date is
                              auto-filled from start + stagger; editing a
                              row pins it (won't auto-update if start or
                              stagger changes). */}
                          <PerPlotDateEditor
                            input={batchPlotNumbersInput}
                            startDate={batchStartDate}
                            staggerDays={batchStaggerDays}
                            overrides={batchPlotDates}
                            onOverrideChange={(plotNumber, date) =>
                              setBatchPlotDates((prev) => {
                                const next = { ...prev };
                                if (date) next[plotNumber] = date;
                                else delete next[plotNumber];
                                return next;
                              })
                            }
                            onResetAll={() => setBatchPlotDates({})}
                          />
                        </>
                      )}
                    </>
                  )}

                  {batchError && (
                    <p className="text-xs font-medium text-red-600">
                      {batchError}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        resetBatchForm();
                        setShowAddForm(false);
                      }}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddBatch}
                      className="h-7 text-xs"
                    >
                      Add to List
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  className="w-full border-dashed"
                >
                  <Plus className="size-4" />
                  Add Plot Group
                </Button>
              )}

              {/* Summary */}
              {totalPlots > 0 && (
                <div className="rounded-md border bg-slate-50/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {totalPlots} {totalPlots === 1 ? "plot" : "plots"}
                  </span>{" "}
                  across {plotBatches.length}{" "}
                  {plotBatches.length === 1 ? "group" : "groups"}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 whitespace-pre-line">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep("site-details")}
                disabled={submitting}
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <div className="flex gap-2">
                {plotBatches.length === 0 ? (
                  <Button
                    onClick={() => {
                      // Check if the form has a valid pending batch to auto-add
                      const pending = buildPendingBatch();
                      if (pending) {
                        const allBatches = [pending];
                        setPlotBatches(allBatches);
                        resetBatchForm();
                        setShowAddForm(false);
                        handleSubmit(allBatches);
                      } else if (showAddForm) {
                        // Form is open but incomplete
                        setBatchError("Please complete the plot group or cancel the form.");
                      } else {
                        handleSubmit();
                      }
                    }}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {submitProgress || "Creating..."}
                      </>
                    ) : (
                      "Create Site"
                    )}
                  </Button>
                ) : hasTemplateOrders ? (
                  <Button onClick={handleStep2Next} disabled={submitting}>
                    Next: Map Suppliers
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      const pending = buildPendingBatch();
                      if (pending) {
                        const allBatches = [...plotBatches, pending];
                        setPlotBatches(allBatches);
                        resetBatchForm();
                        setShowAddForm(false);
                        handleSubmit(allBatches);
                      } else if (showAddForm) {
                        setBatchError("Please complete the plot group or cancel the form.");
                      } else {
                        handleSubmit();
                      }
                    }}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {submitProgress || "Creating..."}
                      </>
                    ) : (
                      `Create Site & ${totalPlots} Plots`
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}

        {/* ===== STEP 3: Supplier Mapping ===== */}
        {step === "supplier-mapping" && (
          <>
            <DialogHeader>
              <DialogTitle>Map Suppliers</DialogTitle>
              <DialogDescription>
                Assign suppliers to material orders. These apply to all plots
                using each template.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[50vh] space-y-4 overflow-y-auto py-2">
              {uniqueTemplatesWithOrders.map(({ template, batchLabels }) => (
                <div key={template.id} className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Used by {batchLabels.join(", ")}
                    </p>
                  </div>
                  {template.jobs
                    .filter((j) => j.orders.length > 0)
                    .flatMap((job) =>
                      job.orders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-lg border bg-slate-50/50 p-3"
                        >
                          <div className="mb-2">
                            <p className="text-sm font-medium">
                              {order.itemsDescription || "Material Order"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              For: {job.name}
                            </p>
                          </div>
                          <Select
                            value={supplierMappings[order.id] || ""}
                            onValueChange={(v) =>
                              setSupplierMappings((prev) => ({
                                ...prev,
                                [order.id]: v || "",
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue placeholder="Select supplier (optional)">
                                {supplierMappings[order.id]
                                  ? suppliers.find((s) => s.id === supplierMappings[order.id])?.name
                                  : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {suppliers.map((sup) => (
                                <SelectItem key={sup.id} value={sup.id}>
                                  {sup.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))
                    )}
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 whitespace-pre-line">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep("plot-batches")}
                disabled={submitting}
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => handleSubmit()} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {submitProgress || "Creating..."}
                  </>
                ) : (
                  `Create Site & ${totalPlots} Plots`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Step Dot ----------

function StepDot({
  num,
  label,
  active,
  done,
}: {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium ${
        active
          ? "text-indigo-600"
          : done
            ? "text-indigo-400"
            : "text-muted-foreground"
      }`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          active
            ? "bg-indigo-600 text-white"
            : done
              ? "bg-indigo-200 text-indigo-700"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {num}
      </span>
      {label}
    </div>
  );
}
