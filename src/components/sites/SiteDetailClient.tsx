"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { format, addWeeks, addDays } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
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
  ShoppingCart,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WatchToggle } from "@/components/sites/WatchToggle";
import { SitePhotoAlbum } from "@/components/sites/SitePhotoAlbum";
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
// Tabs replaced with custom buttons + conditional rendering (Base UI Tabs click bug)
import { ClientOnly } from "@/components/ui/ClientOnly";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { SiteProgramme } from "@/components/programme/SiteProgramme";
import { SiteHeatmap } from "@/components/sites/SiteHeatmap";
import { SnagList } from "@/components/snags/SnagList";
import { SnagDialog } from "@/components/snags/SnagDialog";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DailySiteBrief } from "@/components/reports/DailySiteBrief";
import { ContractorDaySheets } from "@/components/reports/ContractorDaySheets";
import { ContractorComms } from "@/components/reports/ContractorComms";
import { DelayReport } from "@/components/reports/DelayReport";
import { BudgetReport } from "@/components/reports/BudgetReport";
import { SiteCalendar } from "@/components/reports/SiteCalendar";
import { BatchPlotQR } from "@/components/plots/PlotQRCode";
import { SiteQuantsClient } from "@/components/admin/SiteQuantsClient";
import { SiteDrawingsClient } from "@/components/admin/SiteDrawingsClient";
import { WeeklySiteReport } from "@/components/reports/WeeklySiteReport";
import { CriticalPath } from "@/components/reports/CriticalPath";
import { SiteOrders } from "@/components/orders/SiteOrders";
import { SiteLogClient } from "@/components/sites/SiteLogClient";
import { usePlotCreation } from "@/hooks/usePlotCreation";
import { SnagAgeingReport } from "@/components/snags/SnagAgeingReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { SiteCustomerPagesPanel } from "@/components/sites/SiteCustomerPagesPanel";
import { SiteStoryPanel } from "@/components/sites/SiteStoryPanel";
import { SiteClosurePanel } from "@/components/sites/SiteClosurePanel";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/shared/HelpTip";

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
  postcode: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  assignedTo: { id: string; name: string } | null;
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

// ---------- Site Snags Sub-Component ----------

function SiteSnags({ siteId, plots, initialSnagId }: { siteId: string; plots: Array<{ id: string; name: string; plotNumber: string | null }>; initialSnagId?: string }) {
  // Snags come from /api/sites/[id]/snags with a full shape defined by the
  // downstream SnagList/SnagDialog components. We pass them through as-is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snags, setSnags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedSnag, setSelectedSnag] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snagCreateOpen, setSnagCreateOpen] = useState(false);
  const [selectedPlotId, setSelectedPlotId] = useState("");
  const [showAgeingReport, setShowAgeingReport] = useState(false);

  const loadSnags = useCallback(() => {
    fetch(`/api/sites/${siteId}/snags`)
      .then((r) => r.json())
      .then(setSnags)
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    loadSnags();
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: Array<{ id: string; name: string }>) =>
        setUsers(data.map((u) => ({ id: u.id, name: u.name })))
      );
  }, [siteId, loadSnags]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          All Snags ({snags.length})
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={showAgeingReport ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAgeingReport(!showAgeingReport)}
          >
            {showAgeingReport ? "Hide Report" : "Ageing Report"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedPlotId(plots[0]?.id || "");
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            Raise Snag
          </Button>
        </div>
      </div>

      {showAgeingReport && <SnagAgeingReport siteId={siteId} />}

      <SnagList snags={snags} onSelect={(s) => { setSelectedSnag(s); setDialogOpen(true); }} onRefresh={loadSnags} showPlot highlightId={initialSnagId} siteId={siteId} />
      {selectedSnag && (
        <SnagDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          snag={selectedSnag}
          plotId={selectedSnag.plotId}
          users={users}
          onSaved={() => { loadSnags(); setSelectedSnag(null); }}
        />
      )}

      {/* Plot picker dialog — step 1 of create flow */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Plot</DialogTitle>
            <DialogDescription>
              Choose which plot this snag is on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <select
              value={selectedPlotId}
              onChange={(e) => setSelectedPlotId(e.target.value)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {plots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={!selectedPlotId}
              onClick={() => {
                setCreateDialogOpen(false);
                setSnagCreateOpen(true);
              }}
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SnagDialog for creating — step 2, rendered at top level (not nested) */}
      {selectedPlotId && (
        <SnagDialog
          open={snagCreateOpen}
          onOpenChange={setSnagCreateOpen}
          plotId={selectedPlotId}
          users={users}
          onSaved={() => {
            loadSnags();
            setSnagCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Site Documents Sub-Component ----------

function SiteDocuments({ siteId }: { siteId: string }) {
  // Documents come from /api/sites/[id]/documents and are passed straight
  // through to DocumentList, which owns the concrete type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocs = useCallback(() => {
    fetch(`/api/sites/${siteId}/documents`)
      .then((r) => r.json())
      .then(setDocs)
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    loadDocs();
  }, [siteId, loadDocs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DocumentUpload siteId={siteId} onUploaded={loadDocs} />
      <DocumentList
        documents={docs}
        onDelete={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
        level="site"
      />
    </div>
  );
}

// ---------- Main Component ----------

export function SiteDetailClient({
  site: initialSite,
  initialTab,
  initialSnagId,
}: {
  site: SiteDetail;
  initialTab?: string;
  initialSnagId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [site, setSite] = useState(initialSite);

  // Sync site state when server re-renders (e.g. after router.refresh())
  useEffect(() => {
    setSite(initialSite);
  }, [initialSite]);

  // Auto-refresh when user navigates back or tab regains focus
  const refreshSite = useCallback(() => { router.refresh(); }, [router]);
  useRefreshOnFocus(refreshSite);

  // Users list for site manager picker — seed with current assignee so name shows immediately
  const [siteUsers, setSiteUsers] = useState<{ id: string; name: string }[]>(
    site.assignedTo ? [{ id: site.assignedTo.id, name: site.assignedTo.name }] : []
  );
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => setSiteUsers(data.map((u) => ({ id: u.id, name: u.name }))))
      .catch(() => {});
  }, []);

  // Edit site state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(site.name);
  const [editDescription, setEditDescription] = useState(
    site.description ?? ""
  );
  const [editLocation, setEditLocation] = useState(site.location ?? "");
  const [editAddress, setEditAddress] = useState(site.address ?? "");
  const [editPostcode, setEditPostcode] = useState(site.postcode ?? "");
  const [editStatus, setEditStatus] = useState(site.status);
  const [editAssignedToId, setEditAssignedToId] = useState(site.assignedTo?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [postcodeValid, setPostcodeValid] = useState<boolean | null>(null);
  const [postcodeChecking, setPostcodeChecking] = useState(false);
  const [sitePostcodeInvalid, setSitePostcodeInvalid] = useState(false);

  // Add plot state
  const [addPlotDialogOpen, setAddPlotDialogOpen] = useState(false);
  const [plotMode, setPlotMode] = useState<
    "choose" | "blank" | "template" | "bulk"
  >("choose");
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [plotHouseType, setPlotHouseType] = useState("");
  const [creatingPlot, setCreatingPlot] = useState(false);

  // Delete plot state
  const [deletePlotTarget, setDeletePlotTarget] = useState<{
    id: string;
    name: string;
    plotNumber: string | null;
  } | null>(null);
  const [deletingPlot, setDeletingPlot] = useState(false);

  // Schedule status per plot (traffic lights)
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }>>({});

  useEffect(() => {
    fetch(`/api/sites/${site.id}/plot-schedules`)
      .then((r) => r.json())
      .then((arr: Array<{ plotId: string; status: string; daysDeviation: number; awaitingRestart: boolean }>) => {
        const map: Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }> = {};
        for (const item of arr) map[item.plotId] = item;
        setScheduleStatuses(map);
      })
      .catch(() => {});
  }, [site.id]);

  // Template mode state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // Variant picker — only set when the chosen template has variants and
  // the user picks one. "" = "apply the base template directly".
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [templateVariants, setTemplateVariants] = useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);
  const [startDate, setStartDate] = useState("");
  const [plotCreateError, setPlotCreateError] = useState<string | null>(null);
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

  // Controlled tabs + overdue alerts (UX #6)
  const [activeTab, setActiveTab] = useState(initialTab || "plots");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    new Set([initialTab || "plots"])
  );
  const [overdueCount, setOverdueCount] = useState(0);

  // Sync tab when navigating via sidebar links (prop changes on client-side nav)
  useEffect(() => {
    const tab = initialTab || "plots";
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [initialTab]);

  // Check if site postcode is valid for weather
  useEffect(() => {
    if (!site.postcode?.trim()) return;
    fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(site.postcode.trim())}`)
      .then((r) => { if (!r.ok) setSitePostcodeInvalid(true); })
      .catch(() => {});
  }, [site.postcode]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      return new Set(prev).add(tab);
    });
  };

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

  // Fetch overdue count on mount (UX #6)
  useEffect(() => {
    fetch(`/api/sites/${site.id}/daily-brief`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.summary?.overdueJobCount) {
          setOverdueCount(data.summary.overdueJobCount);
        }
      })
      .catch(() => {});
  }, [site.id]);

  // Fetch templates and suppliers when dialog opens in template/bulk mode
  useEffect(() => {
    if (
      addPlotDialogOpen &&
      (plotMode === "template" || plotMode === "bulk") &&
      templates.length === 0
    ) {
      setLoadingTemplates(true);
      Promise.all([
        fetch("/api/plot-templates?liveOnly=true").then((r) => r.json()),
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

  // Calculate the next available plot number/name
  const nextPlotName = useMemo(() => {
    const existingNumbers = site.plots
      .map((p) => {
        const match = (p.plotNumber || p.name).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    return `Plot ${maxNum + 1}`;
  }, [site.plots]);

  // Check for duplicate plot names
  const isDuplicatePlotName = useMemo(() => {
    if (!plotName.trim()) return false;
    return site.plots.some(
      (p) => p.name.toLowerCase() === plotName.trim().toLowerCase()
    );
  }, [plotName, site.plots]);

  async function handleDeletePlot() {
    if (!deletePlotTarget) return;
    setDeletingPlot(true);
    try {
      const res = await fetch(`/api/plots/${deletePlotTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const msg = await fetchErrorMessage(res, "Failed to delete plot");
        throw new Error(msg);
      }
      setDeletePlotTarget(null);
      toast.success("Plot deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete plot");
    } finally {
      setDeletingPlot(false);
    }
  }

  function resetAddPlotDialog() {
    setPlotMode("choose");
    setPlotName("");
    setPlotDescription("");
    setSelectedTemplateId("");
    setSelectedVariantId("");
    setTemplateVariants([]);
    setStartDate("");
    setSupplierMappings({});
    setTemplateStep("config");
    setBulkRangeStart("");
    setBulkRangeEnd("");
    setBulkStep("config");
  }

  async function validatePostcode(pc: string) {
    if (!pc.trim()) {
      setPostcodeValid(null);
      return;
    }
    setPostcodeChecking(true);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc.trim())}`);
      setPostcodeValid(res.ok);
    } catch {
      setPostcodeValid(null);
    } finally {
      setPostcodeChecking(false);
    }
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
          postcode: editPostcode,
          status: editStatus,
          assignedToId: editAssignedToId || null,
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
        postcode: updated.postcode,
        status: updated.status,
        assignedTo: updated.assignedTo ?? null,
        updatedAt: updated.updatedAt,
      }));
      setEditDialogOpen(false);
      setSitePostcodeInvalid(postcodeValid === false);
      toast.success("Site updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update site");
    } finally {
      setSaving(false);
    }
  }

  // Plot creation unified via usePlotCreation — one hook, three paths
  // (blank single / template single / template batch). Same error
  // handling everywhere.
  const { createBlank, createFromTemplate, createBatchFromTemplate } = usePlotCreation();

  async function handleAddPlotBlank() {
    if (!plotName.trim()) return;
    setCreatingPlot(true);
    try {
      const res = await createBlank({
        siteId: site.id,
        name: plotName,
        plotNumber: plotName.match(/(\d+)/)?.[1] || null,
        description: plotDescription || null,
        houseType: plotHouseType || null,
      });
      if (res.ok) {
        resetAddPlotDialog();
        setAddPlotDialogOpen(false);
        router.refresh();
      }
    } finally {
      setCreatingPlot(false);
    }
  }

  async function handleAddPlotFromTemplate() {
    if (!selectedTemplateId || !plotName.trim() || !startDate) return;
    setCreatingPlot(true);
    try {
      const res = await createFromTemplate({
        siteId: site.id,
        templateId: selectedTemplateId,
        variantId: selectedVariantId || null,
        startDate,
        plotName,
        plotNumber: plotName.match(/(\d+)/)?.[1] || null,
        plotDescription: plotDescription || null,
        supplierMappings,
      }, { silent: true }); // we surface inline errors below
      if (!res.ok) {
        setPlotCreateError(res.error ?? "Failed to create plot from template");
        return;
      }

      resetAddPlotDialog();
      setAddPlotDialogOpen(false);
      setPlotCreateError(null);
      router.refresh();
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
    if (!selectedTemplateId || !startDate || bulkPlots.length === 0) return;
    setCreatingPlot(true);
    try {
      const res = await createBatchFromTemplate({
        siteId: site.id,
        templateId: selectedTemplateId,
        variantId: selectedVariantId || null,
        startDate,
        supplierMappings,
        plots: bulkPlots,
      }, { silent: true });

      if (!res.ok) {
        let errorMsg = res.error ?? "Failed to create plots";
        if (res.plotErrors && res.plotErrors.length > 0) {
          const details = res.plotErrors
            .slice(0, 3)
            .map((e) => `Plot ${e.plotNumber}: ${e.error}`)
            .join("; ");
          errorMsg += ` — ${details}${res.plotErrors.length > 3 ? ` (and ${res.plotErrors.length - 3} more)` : ""}`;
        }
        setPlotCreateError(errorMsg);
        return;
      }

      resetAddPlotDialog();
      setAddPlotDialogOpen(false);
      setPlotCreateError(null);
      router.refresh();
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
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>

        <Breadcrumbs items={[
          { label: "Sites", href: "/sites" },
          { label: site.name },
        ]} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
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
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:gap-3">
              {(site.location || site.address) && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {[site.location, site.address]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
              <span className="hidden text-border sm:inline">&middot;</span>
              <span className="hidden sm:inline">Created by {site.createdBy.name}</span>
              {site.assignedTo && (
                <>
                  <span className="hidden text-border sm:inline">&middot;</span>
                  <span className="hidden sm:inline">Managed by {site.assignedTo.name}</span>
                </>
              )}
              <span className="hidden text-border sm:inline">&middot;</span>
              <span className="hidden sm:inline">
                {format(new Date(site.createdAt), "d MMM yyyy")}
              </span>
              <span className="hidden text-border sm:inline">&middot;</span>
              <span>{site._count.plots} {site._count.plots === 1 ? "plot" : "plots"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* (May 2026 audit #152) Watch this site — per-user
                notification opt-in. Star toggle that POST/DELETEs to
                /api/sites/[id]/watch. */}
            <WatchToggle siteId={site.id} siteName={site.name} />
            {/* Quick Raise Snag — hidden on the Snags tab itself (where
                the SnagsTab's own button takes over). One source of truth:
                on every other tab you use the header button, on the Snags
                tab you use the in-tab button. No duplicate.
                Keith Apr 2026 UX audit + follow-up bug report. */}
            {activeTab !== "snags" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTabChange("snags")}
                className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                title="Go to Snags tab to raise a snag"
              >
                <AlertTriangle className="size-4" />
                Raise Snag
              </Button>
            )}
            {activeTab === "plots" && (
              <Button
                variant="outline"
                onClick={() => setAddPlotDialogOpen(true)}
              >
                <Plus className="size-4" />
                Add Plot
              </Button>
            )}
            {/* Add Plot Dialog */}
            <Dialog
              open={addPlotDialogOpen}
              onOpenChange={(open) => {
                setAddPlotDialogOpen(open);
                if (!open) resetAddPlotDialog();
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <HelpTip title="How to add a plot" anchor="below-left">
                  <p><strong>Three ways in:</strong> Blank (just a name — you add jobs later), From Template (copy a saved stage list with dates), or Bulk (several plots from the same template in one go).</p>
                  <p><strong>Template snapshot:</strong> creating from a template <em>copies</em> the jobs to this plot at that point in time. Later edits to the template don&apos;t cascade back to plots already created — you&apos;d edit the jobs on the plot itself.</p>
                  <p><strong>Suppliers step (template / bulk):</strong> the template may have orders with supplier placeholders. Assign real suppliers before creating so orders are ready to go.</p>
                  <p><strong>Start date:</strong> the date the plot&apos;s first job begins. All other job dates are calculated from this.</p>
                </HelpTip>
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

                {/* Error banner — shows the actual server-reported failure */}
                {plotCreateError && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Plot creation failed</p>
                      <p className="mt-0.5 break-words">{plotCreateError}</p>
                    </div>
                    <button
                      onClick={() => setPlotCreateError(null)}
                      className="rounded p-0.5 hover:bg-red-100"
                      aria-label="Dismiss"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}

                {/* Step: Choose mode */}
                {plotMode === "choose" && (
                  <div className="grid grid-cols-3 gap-3 py-4">
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border/50 p-5 text-center transition-all hover:border-blue-300 hover:bg-blue-50/50"
                      onClick={() => { setPlotMode("blank"); setPlotName(nextPlotName); }}
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
                      onClick={() => { setPlotMode("template"); setPlotName(nextPlotName); }}
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
                        {isDuplicatePlotName && (
                          <p className="text-xs text-amber-600">⚠ A plot with this name already exists</p>
                        )}
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
                      <div className="space-y-2">
                        <Label htmlFor="plot-house-type">House Type</Label>
                        <Input
                          id="plot-house-type"
                          placeholder="e.g. Semi-Detached 3-Bed"
                          value={plotHouseType}
                          onChange={(e) => setPlotHouseType(e.target.value)}
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
                              onValueChange={(v) => {
                                if (v === null) return;
                                setSelectedTemplateId(v);
                                setSelectedVariantId("");
                                setTemplateVariants([]);
                                // Lazy-fetch variants for this template
                                void fetch(
                                  `/api/plot-templates/${v}/variants`,
                                  { cache: "no-store" },
                                ).then(async (r) => {
                                  if (!r.ok) return;
                                  const data = await r.json();
                                  setTemplateVariants(
                                    Array.isArray(data) ? data : [],
                                  );
                                });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                {selectedTemplate ? (
                                  <span data-slot="select-value" className="flex flex-1 text-left line-clamp-1">
                                    {selectedTemplate.name}{selectedTemplate.typeLabel ? ` (${selectedTemplate.typeLabel})` : ""}
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Select a template" />
                                )}
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
                          {/* Variant picker — only shown when the chosen
                              template has variants. Defaults to base. */}
                          {selectedTemplateId && templateVariants.length > 0 && (
                            <div className="space-y-2">
                              <Label>
                                Variant{" "}
                                <span className="text-[11px] font-normal text-muted-foreground">
                                  ({templateVariants.length} available)
                                </span>
                              </Label>
                              <Select
                                value={selectedVariantId || "__base__"}
                                onValueChange={(v) =>
                                  setSelectedVariantId(
                                    v === "__base__" ? "" : (v ?? ""),
                                  )
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__base__">
                                    Use base template (no variant)
                                  </SelectItem>
                                  {templateVariants.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.name}
                                      {v.description ? ` — ${v.description}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

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
                            {isDuplicatePlotName && (
                              <p className="text-xs text-amber-600">⚠ A plot with this name already exists</p>
                            )}
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
                                <SelectValue placeholder="Select supplier (optional)">
                                  {supplierMappings[order.id]
                                    ? suppliers.find((s) => s.id === supplierMappings[order.id])?.name || "Select supplier (optional)"
                                    : "Select supplier (optional)"}
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
                              onValueChange={(v) => {
                                if (v === null) return;
                                setSelectedTemplateId(v);
                                setSelectedVariantId("");
                                setTemplateVariants([]);
                                // Lazy-fetch variants for this template
                                void fetch(
                                  `/api/plot-templates/${v}/variants`,
                                  { cache: "no-store" },
                                ).then(async (r) => {
                                  if (!r.ok) return;
                                  const data = await r.json();
                                  setTemplateVariants(
                                    Array.isArray(data) ? data : [],
                                  );
                                });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                {selectedTemplate ? (
                                  <span data-slot="select-value" className="flex flex-1 text-left line-clamp-1">
                                    {selectedTemplate.name}{selectedTemplate.typeLabel ? ` (${selectedTemplate.typeLabel})` : ""}
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Select a template" />
                                )}
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
                          {/* Variant picker — only shown when the chosen
                              template has variants. Defaults to base. */}
                          {selectedTemplateId && templateVariants.length > 0 && (
                            <div className="space-y-2">
                              <Label>
                                Variant{" "}
                                <span className="text-[11px] font-normal text-muted-foreground">
                                  ({templateVariants.length} available)
                                </span>
                              </Label>
                              <Select
                                value={selectedVariantId || "__base__"}
                                onValueChange={(v) =>
                                  setSelectedVariantId(
                                    v === "__base__" ? "" : (v ?? ""),
                                  )
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__base__">
                                    Use base template (no variant)
                                  </SelectItem>
                                  {templateVariants.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.name}
                                      {v.description ? ` — ${v.description}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

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
                              <SelectValue placeholder="Select supplier (optional)">
                                {supplierMappings[order.id]
                                  ? suppliers.find((s) => s.id === supplierMappings[order.id])?.name || "Select supplier (optional)"
                                  : "Select supplier (optional)"}
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
                  setEditAssignedToId(site.assignedTo?.id ?? "");
                }
              }}
            >
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(true)}
                className={sitePostcodeInvalid ? "border-amber-400" : ""}
              >
                <Pencil className="size-4" />
                Edit
                {sitePostcodeInvalid && (
                  <span className="relative -mr-1 ml-0.5">
                    <AlertTriangle className="size-3.5 text-amber-500" />
                  </span>
                )}
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
                    <Label htmlFor="edit-postcode">Postcode</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="edit-postcode"
                        value={editPostcode}
                        onChange={(e) => {
                          setEditPostcode(e.target.value.toUpperCase());
                          setPostcodeValid(null);
                        }}
                        onBlur={() => validatePostcode(editPostcode)}
                        placeholder="e.g. SW1A 1AA"
                        className={`w-40 ${postcodeValid === false ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      />
                      {postcodeChecking && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {postcodeValid === true && <CheckCircle className="size-4 text-green-600" />}
                      {postcodeValid === false && <AlertTriangle className="size-4 text-red-500" />}
                    </div>
                    {postcodeValid === false && (
                      <p className="text-xs text-red-500">Postcode not found — weather forecasts won&apos;t be available</p>
                    )}
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
                  <div className="space-y-2">
                    <Label>Site Manager</Label>
                    <Select
                      value={editAssignedToId || "none"}
                      onValueChange={(v) => setEditAssignedToId(!v || v === "none" ? "" : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned">
                          {editAssignedToId && editAssignedToId !== "none"
                            ? siteUsers.find((u) => u.id === editAssignedToId)?.name ?? "Loading..."
                            : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {siteUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Assigns this person to all jobs on this site</p>
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

      {/* (May 2026 audit #42 + #43 + #45) Site-status banner.
          Pre-fix the only visual clue that a site was ON_HOLD or
          COMPLETED was a tiny chip next to the title — easy to miss,
          and didn't explain the consequence. The banner spells it out
          right above the tabs so a manager landing on a stale site
          knows the state before clicking anything. */}
      {site.status === "ON_HOLD" && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">This site is on hold</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Programme actions still record but contractors and the daily-brief crons skip on-hold sites. Take it off hold from the site header to resume.
              </p>
            </div>
          </div>
        </div>
      )}
      {site.status === "COMPLETED" && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">This site is completed</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Handover ZIP has been (or can be) generated from the Site Closure tab. Edits here are still allowed, but the site no longer appears in active dashboards or the daily-brief email.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overdue alert banner (UX #6) */}
      {overdueCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle className="size-4" />
            {overdueCount} overdue {overdueCount === 1 ? "job" : "jobs"} on this site
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-700 hover:bg-red-100"
            onClick={() => handleTabChange("daily-brief")}
          >
            View Details
          </Button>
        </div>
      )}

      {/* Plot Cards + Programme */}
      {site.plots.length > 0 ? (
        <div>

          <div className={activeTab !== "plots" ? "hidden" : undefined}>
          {visitedTabs.has("plots") && (
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

            <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="plot-search"
                  placeholder="Search plots..."
                  value={plotSearch}
                  onChange={(e) => setPlotSearch(e.target.value)}
                  className="h-8 w-full pl-7 text-sm sm:w-44"
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

              {/* Status Filter — wrapped in ClientOnly to prevent Base UI useId() SSR/CSR mismatch */}
              <ClientOnly fallback={<div className="h-8 w-28 rounded-md border bg-muted/30 animate-pulse" />}>
                <Select value={plotStatusFilter} onValueChange={(v) => v !== null && setPlotStatusFilter(v)}>
                  <SelectTrigger id="plot-status-filter" className="h-8 text-sm">
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
              </ClientOnly>

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
                  className="group cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  onClick={() =>
                    router.push(`/sites/${site.id}/plots/${plot.id}`)
                  }
                  // (May 2026 a11y audit #126) Same pattern as the
                  // SitesClient cards — div-with-onClick wasn't
                  // keyboard-reachable. role="link" + tabIndex make
                  // it Tab-focusable; Enter/Space activate.
                  role="link"
                  tabIndex={0}
                  aria-label={`Open plot ${plot.plotNumber || plot.name}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/sites/${site.id}/plots/${plot.id}`);
                    }
                  }}
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
                        {/* Schedule traffic light */}
                        {scheduleStatuses[plot.id] && (() => {
                          const s = scheduleStatuses[plot.id];
                          if (s.awaitingRestart) return (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              <PauseCircle className="size-2.5" /> Deferred
                            </span>
                          );
                          if (s.status === "ahead") return (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <TrendingUp className="size-2.5" /> {s.daysDeviation}d ahead
                            </span>
                          );
                          if (s.status === "behind") return (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                              <TrendingDown className="size-2.5" /> {Math.abs(s.daysDeviation)}d behind
                            </span>
                          );
                          if (s.status === "on_track") return (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              <Minus className="size-2.5" /> On programme
                            </span>
                          );
                          return null;
                        })()}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Briefcase className="size-3" />
                          <span>
                            {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
                          </span>
                        </div>
                        <button
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          title="Delete plot"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletePlotTarget({
                              id: plot.id,
                              name: plot.name,
                              plotNumber: plot.plotNumber,
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
          )}
          </div>

          {/* Delete Plot Confirmation Dialog */}
          <Dialog
            open={!!deletePlotTarget}
            onOpenChange={(open) => {
              if (!open) setDeletePlotTarget(null);
            }}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  Delete Plot{" "}
                  {deletePlotTarget?.plotNumber
                    ? `#${deletePlotTarget.plotNumber}`
                    : deletePlotTarget?.name}
                  ?
                </DialogTitle>
                <DialogDescription>
                  This will permanently remove all jobs, orders, and snags.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={deletingPlot}
                  onClick={handleDeletePlot}
                >
                  {deletingPlot && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className={activeTab !== "programme" ? "hidden" : "min-w-0 overflow-hidden"}>
            {visitedTabs.has("programme") && (
              <SiteProgramme siteId={site.id} postcode={site.postcode} />
            )}
          </div>

          <div className={activeTab !== "heatmap" ? "hidden" : undefined}>
            {visitedTabs.has("heatmap") && (
              <SiteHeatmap siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "snags" ? "hidden" : undefined}>
            {visitedTabs.has("snags") && (
              <SiteSnags siteId={site.id} plots={site.plots.map((p) => ({ id: p.id, name: p.name, plotNumber: p.plotNumber }))} initialSnagId={initialSnagId} />
            )}
          </div>

          <div className={activeTab !== "documents" ? "hidden" : undefined}>
            {visitedTabs.has("documents") && (
              <SiteDocuments siteId={site.id} />
            )}
          </div>

          {/* (May 2026 audit #154) Site-wide photo album. */}
          <div className={activeTab !== "photos" ? "hidden" : undefined}>
            {visitedTabs.has("photos") && (
              <SitePhotoAlbum siteId={site.id} siteName={site.name} />
            )}
          </div>

          <div className={activeTab !== "daily-brief" ? "hidden" : undefined}>
            {visitedTabs.has("daily-brief") && (
              <DailySiteBrief siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "day-sheets" ? "hidden" : undefined}>
            {visitedTabs.has("day-sheets") && (
              <ContractorDaySheets siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "contractor-comms" ? "hidden" : undefined}>
            {visitedTabs.has("contractor-comms") && (
              <ContractorComms siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "delays" ? "hidden" : undefined}>
            {visitedTabs.has("delays") && (
              <DelayReport siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "budget" ? "hidden" : undefined}>
            {visitedTabs.has("budget") && (
              <BudgetReport siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "calendar" ? "hidden" : undefined}>
            {visitedTabs.has("calendar") && (
              <SiteCalendar siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "weekly-report" ? "hidden" : undefined}>
            {visitedTabs.has("weekly-report") && (
              <WeeklySiteReport siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "orders" ? "hidden" : undefined}>
            {visitedTabs.has("orders") && (
              <SiteOrders siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "log" ? "hidden" : undefined}>
            {visitedTabs.has("log") && (
              <SiteLogClient
                siteId={site.id}
                plots={site.plots.map((p) => ({ id: p.id, name: p.name, plotNumber: p.plotNumber }))}
              />
            )}
          </div>

          <div className={activeTab !== "quants" ? "hidden" : undefined}>
            {visitedTabs.has("quants") && (
              <SiteQuantsClient
                siteId={site.id}
                plots={site.plots.map((p) => ({ id: p.id, plotNumber: p.plotNumber, name: p.name }))}
              />
            )}
          </div>

          <div className={activeTab !== "drawings" ? "hidden" : undefined}>
            {visitedTabs.has("drawings") && (
              <SiteDrawingsClient
                siteId={site.id}
                plots={site.plots.map((p) => ({ id: p.id, plotNumber: p.plotNumber, name: p.name }))}
              />
            )}
          </div>

          <div className={activeTab !== "critical-path" ? "hidden" : undefined}>
            {visitedTabs.has("critical-path") && (
              <CriticalPath siteId={site.id} />
            )}
          </div>

          <div className={activeTab !== "qr-codes" ? "hidden" : undefined}>
            {visitedTabs.has("qr-codes") && (
              <BatchPlotQR
                siteId={site.id}
                siteName={site.name}
                plots={site.plots.map((p) => ({
                  id: p.id,
                  plotNumber: p.plotNumber,
                  name: p.name,
                  houseType: p.houseType ?? null,
                }))}
              />
            )}
          </div>

          <div className={activeTab !== "cash-flow" ? "hidden" : undefined}>
            {visitedTabs.has("cash-flow") && (
              <CashFlowReport siteId={site.id} />
            )}
          </div>

          {/* Customer Pages — site-wide overview of every plot's
              /progress/<token> share link with quick admin actions.
              Lives under the Site Admin sidebar group; per-plot
              management is on the plot detail "Customer view" tab. */}
          <div className={activeTab !== "customer-pages" ? "hidden" : undefined}>
            {visitedTabs.has("customer-pages") && (
              <SiteCustomerPagesPanel siteId={site.id} />
            )}
          </div>

          {/* Site Story — internal retrospective. Builds continuously
              as the site runs. Same data feeds the Handover ZIP. */}
          <div className={activeTab !== "story" ? "hidden" : undefined}>
            {visitedTabs.has("story") && (
              <SiteStoryPanel siteId={site.id} />
            )}
          </div>

          {/* Site Closure — end-of-site Handover ZIP generator. */}
          <div className={activeTab !== "site-closure" ? "hidden" : undefined}>
            {visitedTabs.has("site-closure") && (
              <SiteClosurePanel siteId={site.id} />
            )}
          </div>
        </div>
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
