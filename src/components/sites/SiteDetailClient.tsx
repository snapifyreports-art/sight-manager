"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, addWeeks, addDays } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Pencil,
  MapPin,
  Grid3X3,
  Briefcase,
  Save,
  FolderOpen,
  LayoutTemplate,
  Calendar,
  ChevronRight,
  Package,
  Layers,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SiteProgramme } from "@/components/programme/SiteProgramme";

// ---------- Types ----------

interface JobStatusSummary {
  NOT_STARTED: number;
  IN_PROGRESS: number;
  ON_HOLD: number;
  COMPLETED: number;
}

interface PlotItem {
  id: string;
  name: string;
  description: string | null;
  plotNumber: string | null;
  houseType: string | null;
  createdAt: string;
  _count: { jobs: number };
  jobStatusSummary: JobStatusSummary;
}

interface SiteDetail {
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
  plots: PlotItem[];
}

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

// ---------- Helpers ----------

const SITE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Active",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  },
};

const JOB_STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  ON_HOLD: "bg-amber-500",
  COMPLETED: "bg-green-500",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

function getSiteStatusConfig(status: string) {
  return SITE_STATUS_CONFIG[status] ?? SITE_STATUS_CONFIG.ACTIVE;
}

// ---------- Main Component ----------

export function SiteDetailClient({
  site: initialSite,
}: {
  site: SiteDetail;
}) {
  const router = useRouter();
  const [site, setSite] = useState(initialSite);

  // Edit site state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(site.name);
  const [editDescription, setEditDescription] = useState(
    site.description ?? ""
  );
  const [editLocation, setEditLocation] = useState(site.location ?? "");
  const [editAddress, setEditAddress] = useState(site.address ?? "");
  const [editStatus, setEditStatus] = useState(site.status);
  const [saving, setSaving] = useState(false);

  // Add plot state
  const [addPlotDialogOpen, setAddPlotDialogOpen] = useState(false);
  const [plotMode, setPlotMode] = useState<
    "choose" | "blank" | "template" | "bulk"
  >("choose");
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [creatingPlot, setCreatingPlot] = useState(false);

  // Template mode state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [supplierMappings, setSupplierMappings] = useState<
    Record<string, string>
  >({});
  const [templateStep, setTemplateStep] = useState<"config" | "suppliers">(
    "config"
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Bulk mode state
  const [bulkRangeStart, setBulkRangeStart] = useState("");
  const [bulkRangeEnd, setBulkRangeEnd] = useState("");
  const [bulkStep, setBulkStep] = useState<"config" | "suppliers">("config");

  // Plot tab filter state
  const [plotSearch, setPlotSearch] = useState("");
  const [plotStatusFilter, setPlotStatusFilter] = useState("all");

  const statusConfig = getSiteStatusConfig(site.status);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Filtered plots for the Plots tab
  const filteredSitePlots = useMemo(() => {
    return site.plots.filter((plot) => {
      // Search filter
      if (plotSearch) {
        const term = plotSearch.toLowerCase();
        const matches =
          (plot.plotNumber || "").toLowerCase().includes(term) ||
          plot.name.toLowerCase().includes(term) ||
          (plot.houseType || "").toLowerCase().includes(term);
        if (!matches) return false;
      }

      // Status filter
      if (plotStatusFilter !== "all") {
        const summary = plot.jobStatusSummary;
        if (plotStatusFilter === "IN_PROGRESS" && summary.IN_PROGRESS === 0) return false;
        if (plotStatusFilter === "COMPLETED" && (summary.COMPLETED === 0 || summary.IN_PROGRESS > 0 || summary.NOT_STARTED > 0 || summary.ON_HOLD > 0)) return false;
        if (plotStatusFilter === "NOT_STARTED" && (summary.IN_PROGRESS > 0 || summary.COMPLETED > 0)) return false;
        if (plotStatusFilter === "ON_HOLD" && summary.ON_HOLD === 0) return false;
      }

      return true;
    });
  }, [site.plots, plotSearch, plotStatusFilter]);

  const hasPlotFilters = plotSearch || plotStatusFilter !== "all";

  // Fetch templates and suppliers when dialog opens in template/bulk mode
  useEffect(() => {
    if (
      addPlotDialogOpen &&
      (plotMode === "template" || plotMode === "bulk") &&
      templates.length === 0
    ) {
      setLoadingTemplates(true);
      Promise.all([
        fetch("/api/plot-templates").then((r) => r.json()),
        fetch("/api/suppliers").then((r) => r.json()),
      ])
        .then(([tpls, sups]) => {
          setTemplates(tpls);
          setSuppliers(sups);
        })
        .catch(console.error)
        .finally(() => setLoadingTemplates(false));
    }
  }, [addPlotDialogOpen, plotMode, templates.length]);

  function resetAddPlotDialog() {
    setPlotMode("choose");
    setPlotName("");
    setPlotDescription("");
    setSelectedTemplateId("");
    setStartDate("");
    setSupplierMappings({});
    setTemplateStep("config");
    setBulkRangeStart("");
    setBulkRangeEnd("");
    setBulkStep("config");
  }

  async function handleEditSave() {
    if (!editName.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          location: editLocation,
          address: editAddress,
          status: editStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update site");
      }

      const updated = await res.json();
      setSite((prev) => ({
        ...prev,
        name: updated.name,
        description: updated.description,
        location: updated.location,
        address: updated.address,
        status: updated.status,
        updatedAt: updated.updatedAt,
      }));
      setEditDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update site:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPlotBlank() {
    if (!plotName.trim()) return;

    setCreatingPlot(true);
    try {
      const res = await fetch(`/api/sites/${site.id}/plots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: plotName,
          description: plotDescription || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create plot");
      }

      resetAddPlotDialog();
      setAddPlotDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to create plot:", error);
    } finally {
      setCreatingPlot(false);
    }
  }

  async function handleAddPlotFromTemplate() {
    if (!selectedTemplateId || !plotName.trim() || !startDate) return;

    setCreatingPlot(true);
    try {
      const res = await fetch("/api/plots/apply-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          plotName,
          plotDescription: plotDescription || null,
          templateId: selectedTemplateId,
          startDate,
          supplierMappings,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create plot from template");
      }

      resetAddPlotDialog();
      setAddPlotDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to create plot from template:", error);
    } finally {
      setCreatingPlot(false);
    }
  }

  // Build bulk plot list from range
  const bulkPlots = (() => {
    const start = parseInt(bulkRangeStart);
    const end = parseInt(bulkRangeEnd);
    if (isNaN(start) || isNaN(end) || start > end || end - start > 200)
      return [];
    return Array.from({ length: end - start + 1 }, (_, i) => ({
      plotNumber: String(start + i),
      plotName: `Plot ${start + i}`,
    }));
  })();

  async function handleBulkCreate() {
    if (
      !selectedTemplateId ||
      !startDate ||
      bulkPlots.length === 0
    )
      return;

    setCreatingPlot(true);
    try {
      const res = await fetch("/api/plots/apply-template-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          templateId: selectedTemplateId,
          startDate,
          supplierMappings,
          plots: bulkPlots,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create plots");
      }

      resetAddPlotDialog();
      setAddPlotDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to bulk create plots:", error);
    } finally {
      setCreatingPlot(false);
    }
  }

  // Get all orders from selected template (for supplier mapping step)
  const allTemplateOrders: Array<{
    order: TemplateOrder;
    jobName: string;
  }> = selectedTemplate
    ? selectedTemplate.jobs.flatMap((job) =>
        job.orders.map((order) => ({ order, jobName: job.name }))
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/sites")}
        >
          <ArrowLeft className="size-4" />
          Back to Sites
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {site.name}
              </h1>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.className}`}
              >
                {statusConfig.label}
              </span>
            </div>
            {site.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {site.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {(site.location || site.address) && (
                <>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {[site.location, site.address]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  <span className="text-border">&middot;</span>
                </>
              )}
              <span>Created by {site.createdBy.name}</span>
              <span className="text-border">&middot;</span>
              <span>
                {format(new Date(site.createdAt), "d MMM yyyy")}
              </span>
              <span className="text-border">&middot;</span>
              <span>{site._count.plots} {site._count.plots === 1 ? "plot" : "plots"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Plot Dialog */}
            <Dialog
              open={addPlotDialogOpen}
              onOpenChange={(open) => {
                setAddPlotDialogOpen(open);
                if (!open) resetAddPlotDialog();
              }}
            >
              <Button
                variant="outline"
                onClick={() => setAddPlotDialogOpen(true)}
              >
                <Plus className="size-4" />
                Add Plot
              </Button>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {plotMode === "choose"
                      ? "Add Plot"
                      : plotMode === "blank"
                        ? "New Blank Plot"
                        : plotMode === "bulk"
                          ? bulkStep === "config"
                            ? "Bulk Create Plots"
                            : "Map Suppliers"
                          : templateStep === "config"
                            ? "Plot from Template"
                            : "Map Suppliers"}
                  </DialogTitle>
                  <DialogDescription>
                    {plotMode === "choose"
                      ? "Choose how to create your new plot."
                      : plotMode === "blank"
                        ? "Create a blank plot with no pre-defined jobs."
                        : plotMode === "bulk"
                          ? bulkStep === "config"
                            ? "Create multiple plots from a template at once."
                            : "Assign suppliers to each material order."
                          : templateStep === "config"
                            ? "Select a template and start date."
                            : "Assign suppliers to each material order."}
                  </DialogDescription>
                </DialogHeader>

                {/* Step: Choose mode */}
                {plotMode === "choose" && (
                  <div className="grid grid-cols-3 gap-3 py-4">
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border/50 p-5 text-center transition-all hover:border-blue-300 hover:bg-blue-50/50"
                      onClick={() => setPlotMode("blank")}
                    >
                      <div className="rounded-lg bg-slate-100 p-3">
                        <FolderOpen className="size-6 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Blank Plot</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Start from scratch
                        </p>
                      </div>
                    </button>
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border/50 p-5 text-center transition-all hover:border-blue-300 hover:bg-blue-50/50"
                      onClick={() => setPlotMode("template")}
                    >
                      <div className="rounded-lg bg-blue-100 p-3">
                        <LayoutTemplate className="size-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">From Template</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Single plot with jobs
                        </p>
                      </div>
                    </button>
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border/50 p-5 text-center transition-all hover:border-indigo-300 hover:bg-indigo-50/50"
                      onClick={() => setPlotMode("bulk")}
                    >
                      <div className="rounded-lg bg-indigo-100 p-3">
                        <Layers className="size-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Bulk Create</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Multiple plots at once
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Step: Blank plot form */}
                {plotMode === "blank" && (
                  <>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="plot-name">Plot Name</Label>
                        <Input
                          id="plot-name"
                          placeholder="e.g. Plot 1"
                          value={plotName}
                          onChange={(e) => setPlotName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="plot-description">Description</Label>
                        <Textarea
                          id="plot-description"
                          placeholder="Describe this plot..."
                          value={plotDescription}
                          onChange={(e) =>
                            setPlotDescription(e.target.value)
                          }
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setPlotMode("choose")}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleAddPlotBlank}
                        disabled={creatingPlot || !plotName.trim()}
                      >
                        {creatingPlot ? "Creating..." : "Add Plot"}
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {/* Step: Template config */}
                {plotMode === "template" && templateStep === "config" && (
                  <>
                    <div className="space-y-4 py-2">
                      {loadingTemplates ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          Loading templates...
                        </p>
                      ) : templates.length === 0 ? (
                        <div className="py-4 text-center">
                          <p className="text-sm text-muted-foreground">
                            No templates found. Create one in Settings first.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Template</Label>
                            <Select
                              value={selectedTemplateId}
                              onValueChange={(v) =>
                                v !== null && setSelectedTemplateId(v)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a template" />
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

                          {selectedTemplate && (
                            <div className="rounded-lg border bg-slate-50/50 p-3">
                              <div className="flex items-center gap-2 text-sm">
                                <Briefcase className="size-3.5 text-muted-foreground" />
                                <span>
                                  {selectedTemplate.jobs.length} jobs
                                </span>
                                <span className="text-muted-foreground">
                                  &middot;
                                </span>
                                <Calendar className="size-3.5 text-muted-foreground" />
                                <span>
                                  {selectedTemplate.jobs.length > 0
                                    ? Math.max(
                                        ...selectedTemplate.jobs.map(
                                          (j) => j.endWeek
                                        )
                                      )
                                    : 0}{" "}
                                  weeks
                                </span>
                                {allTemplateOrders.length > 0 && (
                                  <>
                                    <span className="text-muted-foreground">
                                      &middot;
                                    </span>
                                    <Package className="size-3.5 text-muted-foreground" />
                                    <span>
                                      {allTemplateOrders.length} orders
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label htmlFor="tpl-plot-name">Plot Name</Label>
                            <Input
                              id="tpl-plot-name"
                              placeholder="e.g. Plot 1"
                              value={plotName}
                              onChange={(e) => setPlotName(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="tpl-plot-desc">
                              Description
                            </Label>
                            <Textarea
                              id="tpl-plot-desc"
                              placeholder="Optional description..."
                              value={plotDescription}
                              onChange={(e) =>
                                setPlotDescription(e.target.value)
                              }
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="start-date">Start Date</Label>
                            <Input
                              id="start-date"
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              All job dates will be calculated from this date.
                            </p>
                          </div>

                          {/* Preview calculated dates */}
                          {selectedTemplate && startDate && (
                            <div className="space-y-1">
                              <Label className="text-xs">
                                Calculated Schedule
                              </Label>
                              <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border bg-white p-2">
                                {selectedTemplate.jobs.map((job) => {
                                  const sd = new Date(startDate);
                                  const jobStart = addWeeks(
                                    sd,
                                    job.startWeek - 1
                                  );
                                  const jobEnd = addDays(
                                    addWeeks(sd, job.endWeek - 1),
                                    6
                                  );
                                  return (
                                    <div
                                      key={job.id}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span className="font-medium">
                                        {job.name}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {format(jobStart, "d MMM")} –{" "}
                                        {format(jobEnd, "d MMM yyyy")}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setPlotMode("choose")}
                      >
                        Back
                      </Button>
                      {allTemplateOrders.length > 0 ? (
                        <Button
                          onClick={() => setTemplateStep("suppliers")}
                          disabled={
                            !selectedTemplateId ||
                            !plotName.trim() ||
                            !startDate
                          }
                        >
                          Next: Map Suppliers
                          <ChevronRight className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleAddPlotFromTemplate}
                          disabled={
                            creatingPlot ||
                            !selectedTemplateId ||
                            !plotName.trim() ||
                            !startDate
                          }
                        >
                          {creatingPlot ? "Creating..." : "Create Plot"}
                        </Button>
                      )}
                    </DialogFooter>
                  </>
                )}

                {/* Step: Supplier mapping */}
                {plotMode === "template" && templateStep === "suppliers" && (
                  <>
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
                      {allTemplateOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No orders require supplier mapping.
                        </p>
                      ) : (
                        allTemplateOrders.map(({ order, jobName }) => (
                          <div
                            key={order.id}
                            className="rounded-lg border bg-slate-50/50 p-3"
                          >
                            <div className="mb-2">
                              <p className="text-sm font-medium">
                                {order.itemsDescription || "Material Order"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                For: {jobName}
                              </p>
                              {order.items.length > 0 && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {order.items
                                    .map(
                                      (item) =>
                                        `${item.quantity} ${item.unit} ${item.name}`
                                    )
                                    .join(", ")}
                                </div>
                              )}
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
                                <SelectValue placeholder="Select supplier (optional)" />
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
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setTemplateStep("config")}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleAddPlotFromTemplate}
                        disabled={creatingPlot}
                      >
                        {creatingPlot ? "Creating..." : "Create Plot"}
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {/* Step: Bulk config */}
                {plotMode === "bulk" && bulkStep === "config" && (
                  <>
                    <div className="space-y-4 py-2">
                      {loadingTemplates ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          Loading templates...
                        </p>
                      ) : templates.length === 0 ? (
                        <div className="py-4 text-center">
                          <p className="text-sm text-muted-foreground">
                            No templates found. Create one in Settings first.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Template</Label>
                            <Select
                              value={selectedTemplateId}
                              onValueChange={(v) =>
                                v !== null && setSelectedTemplateId(v)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a template" />
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

                          {selectedTemplate && (
                            <div className="rounded-lg border bg-slate-50/50 p-3">
                              <div className="flex items-center gap-2 text-sm">
                                <Briefcase className="size-3.5 text-muted-foreground" />
                                <span>
                                  {selectedTemplate.jobs.length} jobs
                                </span>
                                <span className="text-muted-foreground">
                                  &middot;
                                </span>
                                <Calendar className="size-3.5 text-muted-foreground" />
                                <span>
                                  {selectedTemplate.jobs.length > 0
                                    ? Math.max(
                                        ...selectedTemplate.jobs.map(
                                          (j) => j.endWeek
                                        )
                                      )
                                    : 0}{" "}
                                  weeks
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Plot Number Range</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                placeholder="From"
                                value={bulkRangeStart}
                                onChange={(e) =>
                                  setBulkRangeStart(e.target.value)
                                }
                                className="w-24"
                                min={1}
                              />
                              <span className="text-sm text-muted-foreground">
                                to
                              </span>
                              <Input
                                type="number"
                                placeholder="To"
                                value={bulkRangeEnd}
                                onChange={(e) =>
                                  setBulkRangeEnd(e.target.value)
                                }
                                className="w-24"
                                min={1}
                              />
                              {bulkPlots.length > 0 && (
                                <span className="text-sm font-medium text-indigo-600">
                                  {bulkPlots.length} plots
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Each plot will be named &ldquo;Plot N&rdquo;
                              with its plot number.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="bulk-start-date">Start Date</Label>
                            <Input
                              id="bulk-start-date"
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              All plots will share this start date.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setPlotMode("choose")}
                      >
                        Back
                      </Button>
                      {allTemplateOrders.length > 0 ? (
                        <Button
                          onClick={() => setBulkStep("suppliers")}
                          disabled={
                            !selectedTemplateId ||
                            bulkPlots.length === 0 ||
                            !startDate
                          }
                        >
                          Next: Map Suppliers
                          <ChevronRight className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleBulkCreate}
                          disabled={
                            creatingPlot ||
                            !selectedTemplateId ||
                            bulkPlots.length === 0 ||
                            !startDate
                          }
                        >
                          {creatingPlot ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Creating {bulkPlots.length} plots...
                            </>
                          ) : (
                            `Create ${bulkPlots.length} Plots`
                          )}
                        </Button>
                      )}
                    </DialogFooter>
                  </>
                )}

                {/* Step: Bulk supplier mapping */}
                {plotMode === "bulk" && bulkStep === "suppliers" && (
                  <>
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
                        <p className="text-xs font-medium text-indigo-700">
                          Creating {bulkPlots.length} plots (Plot{" "}
                          {bulkRangeStart}–{bulkRangeEnd})
                        </p>
                        <p className="text-[11px] text-indigo-600/80">
                          Supplier mappings apply to all plots.
                        </p>
                      </div>
                      {allTemplateOrders.map(({ order, jobName }) => (
                        <div
                          key={order.id}
                          className="rounded-lg border bg-slate-50/50 p-3"
                        >
                          <div className="mb-2">
                            <p className="text-sm font-medium">
                              {order.itemsDescription || "Material Order"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              For: {jobName}
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
                              <SelectValue placeholder="Select supplier (optional)" />
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
                      ))}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setBulkStep("config")}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleBulkCreate}
                        disabled={creatingPlot}
                      >
                        {creatingPlot ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Creating {bulkPlots.length} plots...
                          </>
                        ) : (
                          `Create ${bulkPlots.length} Plots`
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>

            {/* Edit Site Dialog */}
            <Dialog
              open={editDialogOpen}
              onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (open) {
                  setEditName(site.name);
                  setEditDescription(site.description ?? "");
                  setEditLocation(site.location ?? "");
                  setEditAddress(site.address ?? "");
                  setEditStatus(site.status);
                }
              }}
            >
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Site</DialogTitle>
                  <DialogDescription>
                    Update this site&apos;s details.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-location">Location</Label>
                      <Input
                        id="edit-location"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-address">Address</Label>
                      <Input
                        id="edit-address"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={editStatus}
                      onValueChange={(v) => v !== null && setEditStatus(v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="ON_HOLD">On Hold</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleEditSave}
                    disabled={saving || !editName.trim()}
                  >
                    <Save className="size-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Plot Cards + Programme */}
      {site.plots.length > 0 ? (
        <Tabs defaultValue="plots">
          <TabsList variant="line">
            <TabsTrigger value="plots">Plots</TabsTrigger>
            <TabsTrigger value="programme">Programme</TabsTrigger>
          </TabsList>

          <TabsContent value="plots">
        <div className="space-y-4">
          {/* Header + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Plots</h2>
              <span className="text-sm text-muted-foreground">
                ({site.plots.length})
              </span>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search plots..."
                  value={plotSearch}
                  onChange={(e) => setPlotSearch(e.target.value)}
                  className="h-8 w-44 pl-7 text-sm"
                />
                {plotSearch && (
                  <button
                    onClick={() => setPlotSearch("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <Select value={plotStatusFilter} onValueChange={(v) => v !== null && setPlotStatusFilter(v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="ON_HOLD">On Hold</SelectItem>
                  <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                </SelectContent>
              </Select>

              {hasPlotFilters && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {filteredSitePlots.length} of {site.plots.length}
                  </span>
                  <button
                    onClick={() => {
                      setPlotSearch("");
                      setPlotStatusFilter("all");
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {filteredSitePlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border py-12 text-center">
              <Search className="size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No plots match your filters</p>
              <button
                onClick={() => {
                  setPlotSearch("");
                  setPlotStatusFilter("all");
                }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            </div>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSitePlots.map((plot) => {
              const totalJobs = plot._count.jobs;

              return (
                <Card
                  key={plot.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() =>
                    router.push(`/sites/${site.id}/plots/${plot.id}`)
                  }
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {plot.plotNumber && (
                            <span className="inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              #{plot.plotNumber}
                            </span>
                          )}
                          <CardTitle className="truncate">
                            {plot.name}
                          </CardTitle>
                        </div>
                        {plot.houseType && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {plot.houseType}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase className="size-3" />
                        <span>
                          {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
                        </span>
                      </div>
                    </div>
                    {plot.description && (
                      <CardDescription className="line-clamp-2">
                        {plot.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent>
                    {/* Job status summary dots */}
                    {totalJobs > 0 && (
                      <div className="flex items-center gap-2">
                        {(
                          Object.entries(plot.jobStatusSummary) as [
                            string,
                            number,
                          ][]
                        )
                          .filter(([, count]) => count > 0)
                          .map(([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center gap-1"
                              title={`${JOB_STATUS_LABEL[status] ?? status}: ${count}`}
                            >
                              <div
                                className={`size-2 rounded-full ${JOB_STATUS_DOT[status]}`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                    {totalJobs === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No jobs assigned yet
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </div>
          </TabsContent>

          <TabsContent value="programme">
            <SiteProgramme siteId={site.id} />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No plots yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add your first plot to this site to start organising jobs and
              tracking progress.
            </p>
            <Button
              className="mt-4"
              onClick={() => setAddPlotDialogOpen(true)}
            >
              <Plus className="size-4" />
              Add Plot
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
