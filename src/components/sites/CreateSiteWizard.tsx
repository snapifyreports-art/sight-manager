"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
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

interface PlotBatch {
  id: string;
  mode: "blank" | "template";
  rangeStart: string;
  rangeEnd: string;
  startDate: string;
  templateId: string;
  templateName: string;
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
  const [batchRangeStart, setBatchRangeStart] = useState("");
  const [batchRangeEnd, setBatchRangeEnd] = useState("");
  const [batchTemplateId, setBatchTemplateId] = useState("");
  const [batchStartDate, setBatchStartDate] = useState("");
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
        fetch("/api/plot-templates").then(async (r) => {
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
    setBatchRangeStart("");
    setBatchRangeEnd("");
    setBatchTemplateId("");
    setBatchStartDate("");
    setBatchError("");
  }

  // Get all plot numbers already claimed
  const claimedNumbers = new Set(
    plotBatches.flatMap((b) => {
      const s = parseInt(b.rangeStart);
      const e = parseInt(b.rangeEnd);
      if (isNaN(s) || isNaN(e)) return [];
      return Array.from({ length: e - s + 1 }, (_, i) => s + i);
    })
  );

  function handleAddBatch() {
    setBatchError("");

    const start = parseInt(batchRangeStart);
    const end = batchRangeEnd ? parseInt(batchRangeEnd) : start;

    if (isNaN(start) || start < 1) {
      setBatchError("Enter a valid starting plot number.");
      return;
    }
    if (isNaN(end) || end < start) {
      setBatchError("End must be greater than or equal to start.");
      return;
    }
    if (end - start > 199) {
      setBatchError("Maximum 200 plots per group.");
      return;
    }

    // Check overlap
    for (let n = start; n <= end; n++) {
      if (claimedNumbers.has(n)) {
        setBatchError(`Plot ${n} is already in another group.`);
        return;
      }
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

    setPlotBatches((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        mode: batchMode,
        rangeStart: String(start),
        rangeEnd: String(end),
        startDate: batchStartDate,
        templateId: batchTemplateId,
        templateName: tpl?.name ?? "",
      },
    ]);

    resetBatchForm();
    setShowAddForm(false);
  }

  function removeBatch(id: string) {
    setPlotBatches((prev) => prev.filter((b) => b.id !== id));
  }

  // Compute total plots
  const totalPlots = plotBatches.reduce((sum, b) => {
    const s = parseInt(b.rangeStart);
    const e = parseInt(b.rangeEnd);
    return sum + (isNaN(s) || isNaN(e) ? 0 : e - s + 1);
  }, 0);

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
        .map((b) =>
          b.rangeStart === b.rangeEnd
            ? `Plot ${b.rangeStart}`
            : `Plots ${b.rangeStart}–${b.rangeEnd}`
        );
      result.push({ template: tpl, batchLabels: labels });
    }
    return result;
  })();

  // Selected template for the add form
  const selectedBatchTemplate = templates.find(
    (t) => t.id === batchTemplateId
  );

  // Build a pending batch from the open form (if valid), or return null
  function buildPendingBatch(): PlotBatch | null {
    if (!showAddForm) return null;

    const start = parseInt(batchRangeStart);
    const end = batchRangeEnd ? parseInt(batchRangeEnd) : start;

    if (isNaN(start) || start < 1) return null;
    if (isNaN(end) || end < start) return null;

    if (batchMode === "template" && (!batchTemplateId || !batchStartDate)) {
      return null;
    }

    const tpl = templates.find((t) => t.id === batchTemplateId);
    return {
      id: crypto.randomUUID(),
      mode: batchMode,
      rangeStart: String(start),
      rangeEnd: String(end),
      startDate: batchStartDate,
      templateId: batchTemplateId,
      templateName: tpl?.name ?? "",
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
        const rangeLabel =
          batch.rangeStart === batch.rangeEnd
            ? `Plot ${batch.rangeStart}`
            : `Plots ${batch.rangeStart}–${batch.rangeEnd}`;
        setSubmitProgress(`Creating ${rangeLabel}...`);

        try {
          if (batch.mode === "blank") {
            const start = parseInt(batch.rangeStart);
            const end = parseInt(batch.rangeEnd);
            // Batch in groups of 3 for Supabase pool limit
            for (let n = start; n <= end; n += 3) {
              const chunk = [];
              for (let k = n; k <= Math.min(n + 2, end); k++) {
                chunk.push(
                  fetch(`/api/sites/${createdSite.id}/plots`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: `Plot ${k}`, plotNumber: String(k) }),
                  })
                );
              }
              const results = await Promise.all(chunk);
              for (const r of results) {
                if (!r.ok) {
                  let errorMsg = "Failed to create plot";
                  try { const err = await r.json(); errorMsg = err.error || errorMsg; } catch {}
                  throw new Error(errorMsg);
                }
              }
            }
          } else {
            // Template batch
            const start = parseInt(batch.rangeStart);
            const end = parseInt(batch.rangeEnd);
            const plots = Array.from({ length: end - start + 1 }, (_, i) => ({
              plotNumber: String(start + i),
              plotName: `Plot ${start + i}`,
            }));

            const res = await fetch("/api/plots/apply-template-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                siteId: createdSite.id,
                templateId: batch.templateId,
                startDate: batch.startDate,
                supplierMappings,
                plots,
              }),
            });

            if (!res.ok) {
              let errorMsg = "Failed to create plots";
              try { const err = await res.json(); errorMsg = err.error || errorMsg; } catch {}
              throw new Error(errorMsg);
            }
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
        {/* Step indicator */}
        <div className="flex items-center gap-2 pb-1">
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
                    <SelectValue placeholder="Unassigned" />
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
                    const count =
                      parseInt(batch.rangeEnd) - parseInt(batch.rangeStart) + 1;
                    return (
                      <div
                        key={batch.id}
                        className="flex items-center gap-3 rounded-lg border bg-slate-50/50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Layers className="size-3.5 text-muted-foreground" />
                            {batch.rangeStart === batch.rangeEnd
                              ? `Plot ${batch.rangeStart}`
                              : `Plots ${batch.rangeStart}–${batch.rangeEnd}`}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({count} {count === 1 ? "plot" : "plots"})
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {batch.mode === "template" ? (
                              <>
                                <LayoutTemplate className="size-3" />
                                <span>{batch.templateName}</span>
                                <span>&middot;</span>
                                <Calendar className="size-3" />
                                <span>
                                  {format(
                                    new Date(batch.startDate + "T00:00:00"),
                                    "d MMM yyyy"
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="italic">Blank plots</span>
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

                  {/* Plot range */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Plot Numbers</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="From"
                        value={batchRangeStart}
                        onChange={(e) => setBatchRangeStart(e.target.value)}
                        className="h-8 w-20 text-sm"
                        min={1}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        placeholder="To"
                        value={batchRangeEnd}
                        onChange={(e) => setBatchRangeEnd(e.target.value)}
                        className="h-8 w-20 text-sm"
                        min={1}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Leave &ldquo;To&rdquo; empty for a single plot
                      </span>
                    </div>
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
                              onValueChange={(v) =>
                                v !== null && setBatchTemplateId(v)
                              }
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

                          <div className="space-y-1.5">
                            <Label className="text-xs">Start Date</Label>
                            <Input
                              type="date"
                              value={batchStartDate}
                              onChange={(e) => setBatchStartDate(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
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
      className={`flex items-center gap-1.5 text-xs font-medium ${
        active
          ? "text-indigo-600"
          : done
            ? "text-indigo-400"
            : "text-muted-foreground"
      }`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
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
