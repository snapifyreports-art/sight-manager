"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  Cloud,
  CloudRain,
  Sun,
  AlertTriangle,
  Package,
  CheckCircle2,
  Clock,
  Activity,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Play,
  Check,
  ListChecks,
  X,
  Snowflake,
  CloudLightning,
  CloudFog,
  Thermometer,
  Bug,
  ShoppingCart,
  MapPin,
  CalendarClock,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DailySiteBriefProps {
  siteId: string;
}

interface BriefData {
  site: { name: string };
  date: string;
  isRainedOff: boolean;
  rainedOffNote: string | null;
  summary: {
    totalPlots: number;
    totalJobs: number;
    completedJobs: number;
    progressPercent: number;
    activeJobCount: number;
    overdueJobCount: number;
    openSnagCount: number;
  };
  jobsStartingToday: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
  jobsDueToday: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  overdueJobs: Array<{
    id: string;
    name: string;
    status: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  activeJobs: Array<{
    id: string;
    name: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  deliveriesToday: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    supplier: { id: string; name: string };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  overdueDeliveries: Array<{
    id: string;
    itemsDescription: string | null;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name: string } | null;
  }>;
  openSnagsList: Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    location: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string; siteId: string };
    assignedTo: { name: string } | null;
    contact: { name: string; company: string | null } | null;
  }>;
  ordersToPlace: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  jobsStartingTomorrow: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
  weather: {
    today: { date: string; category: string; tempMax: number; tempMin: number };
    forecast: Array<{ date: string; category: string; tempMax: number; tempMin: number }>;
  } | null;
}

// Weather icon mapping
function WeatherIcon({ category, className }: { category: string; className?: string }) {
  const cn = className || "size-5";
  switch (category) {
    case "clear": return <Sun className={cn} />;
    case "partly_cloudy": return <Cloud className={cn} />;
    case "cloudy": return <Cloud className={cn} />;
    case "fog": return <CloudFog className={cn} />;
    case "rain": return <CloudRain className={cn} />;
    case "snow": return <Snowflake className={cn} />;
    case "thunder": return <CloudLightning className={cn} />;
    default: return <Cloud className={cn} />;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly Cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};

// Quick action button for starting/completing a job (UX #1)
function JobActionButton({
  jobId,
  status,
  pending,
  onAction,
  onExtend,
}: {
  jobId: string;
  status: string;
  pending: boolean;
  onAction: (jobId: string, action: "start" | "complete") => void;
  onExtend?: (jobId: string) => void;
}) {
  if (status === "COMPLETED") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-600">
        <Check className="size-3" /> Done
      </span>
    );
  }

  if (pending) {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }

  if (status === "NOT_STARTED") {
    return (
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
          onClick={(e) => {
            e.stopPropagation();
            onAction(jobId, "start");
          }}
        >
          <Play className="size-2.5" /> Start
        </Button>
      </div>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
          onClick={(e) => {
            e.stopPropagation();
            onAction(jobId, "complete");
          }}
        >
          <CheckCircle2 className="size-2.5" /> Complete
        </Button>
      </div>
    );
  }

  return null;
}

export function DailySiteBrief({ siteId }: DailySiteBriefProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(getCurrentDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Quick action state (UX #1)
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  // Extend dialog state
  const [extendTarget, setExtendTarget] = useState<{ id: string; name: string; endDate: string | null } | null>(null);
  const [extendDays, setExtendDays] = useState(1);
  const [extendPreview, setExtendPreview] = useState<{ deltaDays: number; jobUpdates: { jobId: string; jobName?: string }[]; orderUpdates: unknown[] } | null>(null);
  const [extendLoading, setExtendLoading] = useState(false);

  // Cascade-on-complete dialog state
  const [cascadeTarget, setCascadeTarget] = useState<{ jobId: string; jobName: string; deltaDays: number; endDate: string; actualEndDate: string } | null>(null);
  const [cascadePreview, setCascadePreview] = useState<{ deltaDays: number; jobUpdates: { jobId: string; jobName?: string }[]; orderUpdates: unknown[] } | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);

  // Rained off state (UX #4)
  const [rainedOffDialogOpen, setRainedOffDialogOpen] = useState(false);
  const [rainedOffNote, setRainedOffNote] = useState("");
  const [rainedOffDelay, setRainedOffDelay] = useState(true);
  const [savingRainedOff, setSavingRainedOff] = useState(false);

  // Bulk mode state (UX #3)
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Snag & order inline actions
  const [pendingSnagActions, setPendingSnagActions] = useState<Set<string>>(new Set());
  const [pendingOrderActions, setPendingOrderActions] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    setLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");
    fetch(`/api/sites/${siteId}/daily-brief?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey, devDate]);

  const prevDay = () => setDate((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setDate((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setDate(getCurrentDate());

  // Quick job action handler (UX #1)
  const handleJobAction = async (jobId: string, action: "start" | "complete") => {
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const result = await res.json();
        setRefreshKey((k) => k + 1);

        // After completing, check if dates differ and prompt cascade
        if (action === "complete" && result.endDate && result.actualEndDate) {
          const delta = differenceInCalendarDays(
            new Date(result.actualEndDate),
            new Date(result.endDate)
          );
          if (delta !== 0) {
            setCascadeTarget({
              jobId,
              jobName: result.name || "Job",
              deltaDays: delta,
              endDate: result.endDate,
              actualEndDate: result.actualEndDate,
            });
            try {
              const previewRes = await fetch(`/api/jobs/${jobId}/cascade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEndDate: result.actualEndDate }),
              });
              if (previewRes.ok) {
                setCascadePreview(await previewRes.json());
              }
            } catch {
              // ignore preview failure
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  // Extend dialog handlers
  const handleExtendOpen = async (jobId: string) => {
    // Fetch the job directly to get its endDate reliably
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        setExtendTarget({ id: job.id, name: job.name, endDate: job.endDate || null });
        setExtendDays(1);
        setExtendPreview(null);
      }
    } catch {
      // ignore
    }
  };

  const handleExtendPreview = async () => {
    if (!extendTarget || !extendTarget.endDate) return;
    setExtendLoading(true);
    try {
      const newEndDate = addDays(new Date(extendTarget.endDate), extendDays);
      const res = await fetch(`/api/jobs/${extendTarget.id}/cascade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: newEndDate.toISOString() }),
      });
      if (res.ok) {
        setExtendPreview(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setExtendLoading(false);
    }
  };

  const handleExtendConfirm = async () => {
    if (!extendTarget || !extendTarget.endDate) return;
    setExtendLoading(true);
    try {
      const newEndDate = addDays(new Date(extendTarget.endDate), extendDays);
      const res = await fetch(`/api/jobs/${extendTarget.id}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: newEndDate.toISOString(), confirm: true }),
      });
      if (res.ok) {
        setExtendTarget(null);
        setExtendPreview(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setExtendLoading(false);
    }
  };

  const handleCascadeConfirm = async () => {
    if (!cascadeTarget) return;
    setCascadeLoading(true);
    try {
      const res = await fetch(`/api/jobs/${cascadeTarget.jobId}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: cascadeTarget.actualEndDate, confirm: true }),
      });
      if (res.ok) {
        setCascadeTarget(null);
        setCascadePreview(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setCascadeLoading(false);
    }
  };

  // Rained off handlers (UX #4)
  const handleMarkRainedOff = async () => {
    setSavingRainedOff(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      await fetch(`/api/sites/${siteId}/rained-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          note: rainedOffNote || undefined,
          delayJobs: rainedOffDelay,
        }),
      });
      setRainedOffDialogOpen(false);
      setRainedOffNote("");
      setRefreshKey((k) => k + 1);
    } catch {
      // ignore
    } finally {
      setSavingRainedOff(false);
    }
  };

  const handleUndoRainedOff = async () => {
    const dateStr = format(date, "yyyy-MM-dd");
    await fetch(`/api/sites/${siteId}/rained-off?date=${dateStr}`, {
      method: "DELETE",
    });
    setRefreshKey((k) => k + 1);
  };

  const handleSnagAction = async (snagId: string, status: string) => {
    setPendingSnagActions((prev) => new Set(prev).add(snagId));
    try {
      const res = await fetch(`/api/snags/${snagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch { /* ignore */ } finally {
      setPendingSnagActions((prev) => { const n = new Set(prev); n.delete(snagId); return n; });
    }
  };

  const handleOrderAction = async (orderId: string, status: string) => {
    setPendingOrderActions((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch { /* ignore */ } finally {
      setPendingOrderActions((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  };

  // One-click bulk action (no bulk mode required)
  const handleQuickBulk = async (jobIds: string[], action: "start" | "complete") => {
    if (jobIds.length === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds, action }),
      });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      // ignore
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk action handler (UX #3)
  const handleBulkAction = async (action: "start" | "complete") => {
    if (selectedJobIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobIds),
          action,
        }),
      });
      if (res.ok) {
        setBulkMode(false);
        setSelectedJobIds(new Set());
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setBulkProcessing(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;

  // Collect all actionable jobs for bulk mode
  const allActionableJobs = [
    ...data.jobsStartingToday.filter((j) => j.status !== "COMPLETED"),
    ...data.jobsDueToday.filter((j) => j.status !== "COMPLETED"),
    ...data.overdueJobs.filter((j) => j.status !== "COMPLETED"),
  ];
  // Deduplicate by id
  const uniqueActionableIds = new Set(allActionableJobs.map((j) => j.id));

  // Job row renderer with action buttons + optional checkbox
  const renderJobRow = (
    j: { id: string; name: string; status: string; plot: { plotNumber: string | null; name: string }; assignedTo?: { name: string } | null; endDate?: string | null; contractors?: Array<{ contact: { name: string; company: string | null } }> },
    showAction = true
  ) => (
    <div key={j.id} className="flex items-center gap-2 rounded border p-2 text-sm">
      {bulkMode && (
        <input
          type="checkbox"
          checked={selectedJobIds.has(j.id)}
          onChange={() => toggleJobSelection(j.id)}
          className="size-3.5 shrink-0 accent-blue-600"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
          {j.status && j.status !== "NOT_STARTED" && (
            <Badge variant={j.status === "IN_PROGRESS" ? "default" : "secondary"} className="shrink-0 text-[10px]">
              {j.status.replace("_", " ")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
          {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
          {j.contractors?.[0] && <span className="hidden sm:inline"> · {j.contractors[0].contact.company || j.contractors[0].contact.name}</span>}
          {j.endDate && <span className="hidden sm:inline"> · Due {format(new Date(j.endDate), "dd MMM")}</span>}
        </p>
      </div>
      {showAction && !bulkMode && (
        <JobActionButton
          jobId={j.id}
          status={j.status}
          pending={pendingActions.has(j.id)}
          onAction={handleJobAction}
          onExtend={handleExtendOpen}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Date nav + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay}>
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger className="text-sm font-semibold sm:text-lg hover:text-primary hover:underline underline-offset-4 transition-colors cursor-pointer">
              {format(date, "EEEE, d MMMM yyyy")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setCalendarOpen(false);
                  }
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={nextDay}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk mode toggle (UX #3) */}
          <Button
            variant={bulkMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedJobIds(new Set());
            }}
          >
            <ListChecks className="mr-1 size-3.5" />
            <span className="hidden sm:inline">{bulkMode ? "Exit Bulk" : "Bulk Actions"}</span>
            <span className="sm:hidden">{bulkMode ? "Exit" : "Bulk"}</span>
          </Button>

          {/* Rained Off button (UX #4) */}
          {data.isRainedOff ? (
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={handleUndoRainedOff}
            >
              <CloudRain className="mr-1 size-3.5" />
              Undo Rained Off
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              onClick={() => setRainedOffDialogOpen(true)}
            >
              <CloudRain className="mr-1 size-3.5" />
              <span className="hidden sm:inline">Mark </span>Rained Off
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Bulk action floating bar (UX #3) */}
      {bulkMode && selectedJobIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedJobIds.size} selected
          </span>
          <Button
            size="sm"
            className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700"
            disabled={bulkProcessing}
            onClick={() => handleBulkAction("start")}
          >
            <Play className="size-3" /> Start Selected
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 bg-blue-600 text-white hover:bg-blue-700"
            disabled={bulkProcessing}
            onClick={() => handleBulkAction("complete")}
          >
            <CheckCircle2 className="size-3" /> Complete Selected
          </Button>
          <button
            className="ml-auto text-xs text-blue-600 hover:text-blue-800"
            onClick={() => {
              const all = new Set<string>();
              allActionableJobs.forEach((j) => all.add(j.id));
              setSelectedJobIds(all);
            }}
          >
            Select All ({uniqueActionableIds.size})
          </button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedJobIds(new Set())}
          >
            Deselect All
          </button>
          {bulkProcessing && <Loader2 className="ml-2 size-4 animate-spin" />}
        </div>
      )}

      {/* Rained off banner */}
      {data.isRainedOff && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
          <CloudRain className="size-5 shrink-0" />
          <div>
            <p className="font-medium">Rained Off</p>
            {data.rainedOffNote && (
              <p className="text-sm opacity-80">{data.rainedOffNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{s.progressPercent}%</p>
            <p className="text-xs text-muted-foreground">
              Overall Progress
            </p>
            <p className="text-[10px] text-muted-foreground">
              {s.completedJobs}/{s.totalJobs} jobs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {s.activeJobCount}
            </p>
            <p className="text-xs text-muted-foreground">Active Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.overdueJobCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {s.overdueJobCount}
            </p>
            <p className="text-xs text-muted-foreground">Overdue Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.openSnagCount > 0 ? "text-orange-600" : "text-green-600"}`}>
              {s.openSnagCount}
            </p>
            <p className="text-xs text-muted-foreground">Open Snags</p>
          </CardContent>
        </Card>
      </div>

      {/* Weather forecast widget */}
      {data.weather && (() => {
        const tomorrow = data.weather.forecast[0];
        const tomorrowIsBad = tomorrow && ["rain", "snow", "thunder"].includes(tomorrow.category);
        const todayIsBad = ["rain", "snow", "thunder"].includes(data.weather.today.category);
        const allDays = [data.weather.today, ...data.weather.forecast];
        const badDays = allDays.filter((d) => ["rain", "snow", "thunder"].includes(d.category));
        return (
          <Card className={todayIsBad ? "border-blue-300 bg-blue-50/40" : ""}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start gap-4">
                {/* Today's weather — main */}
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${todayIsBad ? "bg-blue-100" : "bg-blue-50"}`}>
                    <WeatherIcon category={data.weather.today.category} className="size-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</p>
                    <p className="text-base font-semibold">
                      {CATEGORY_LABELS[data.weather.today.category] || data.weather.today.category}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Thermometer className="size-3" />
                      {Math.round(data.weather.today.tempMin)}° – {Math.round(data.weather.today.tempMax)}°C
                    </p>
                  </div>
                </div>

                {/* Tomorrow — highlighted */}
                {tomorrow && (
                  <>
                    <div className="h-14 border-l" />
                    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${tomorrowIsBad ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"}`}>
                      <div className={`rounded-lg p-2 ${tomorrowIsBad ? "bg-amber-100" : "bg-slate-100"}`}>
                        <WeatherIcon category={tomorrow.category} className={`size-7 ${tomorrowIsBad ? "text-amber-600" : "text-slate-500"}`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tomorrow</p>
                        <p className={`text-sm font-semibold ${tomorrowIsBad ? "text-amber-700" : ""}`}>
                          {CATEGORY_LABELS[tomorrow.category] || tomorrow.category}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Thermometer className="size-3" />
                          {Math.round(tomorrow.tempMin)}° – {Math.round(tomorrow.tempMax)}°C
                        </p>
                      </div>
                      {tomorrowIsBad && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2 h-7 border-amber-300 bg-white px-2 text-[10px] text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setDate(addDays(date, 1));
                            setTimeout(() => setRainedOffDialogOpen(true), 50);
                          }}
                        >
                          <CloudRain className="mr-1 size-3" />
                          Pre-mark
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {/* Remaining forecast days */}
                {data.weather.forecast.length > 1 && (
                  <>
                    <div className="hidden h-14 border-l sm:block" />
                    <div className="hidden gap-4 sm:flex">
                      {data.weather.forecast.slice(1).map((day) => (
                        <div key={day.date} className="flex flex-col items-center gap-1 text-center">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {format(new Date(day.date + "T12:00:00"), "EEE")}
                          </span>
                          <WeatherIcon category={day.category} className="size-4 text-slate-500" />
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(day.tempMax)}°
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Rain day action banner */}
              {todayIsBad && !data.isRainedOff && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-100 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <CloudRain className="size-4 shrink-0" />
                    <span className="font-medium">Rain today — do you want to mark this as a rained off day?</span>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => setRainedOffDialogOpen(true)}
                  >
                    Mark Rained Off
                  </Button>
                </div>
              )}

              {/* General weather warning */}
              {!todayIsBad && badDays.length > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>
                    Outdoor jobs may be affected —{" "}
                    {badDays
                      .map((d) => format(new Date(d.date + "T12:00:00"), "EEE"))
                      .join(", ")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs starting today */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="size-4 text-green-600" />
              Starting Today ({data.jobsStartingToday.length})
              {!bulkMode && (() => {
                const startable = data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED");
                return startable.length > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                    disabled={bulkProcessing}
                    onClick={() => handleQuickBulk(startable.map((j) => j.id), "start")}
                  >
                    {bulkProcessing ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-2.5" />}
                    Start All ({startable.length})
                  </Button>
                ) : null;
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobsStartingToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs starting today</p>
            ) : (
              <div className="space-y-2">
                {data.jobsStartingToday.map((j) => renderJobRow(j))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs due today */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-orange-600" />
              Due Today ({data.jobsDueToday.length})
              {!bulkMode && (() => {
                const completable = data.jobsDueToday.filter((j) => j.status === "IN_PROGRESS");
                return completable.length > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                    disabled={bulkProcessing}
                    onClick={() => handleQuickBulk(completable.map((j) => j.id), "complete")}
                  >
                    {bulkProcessing ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-2.5" />}
                    Complete All ({completable.length})
                  </Button>
                ) : null;
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobsDueToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs due today</p>
            ) : (
              <div className="space-y-2">
                {data.jobsDueToday.map((j) => renderJobRow(j))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deliveries expected */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="size-4 text-blue-600" />
              Deliveries Today ({data.deliveriesToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.deliveriesToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries expected</p>
            ) : (
              <div className="space-y-2">
                {data.deliveriesToday.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-2 rounded border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/suppliers/${d.supplier.id}`} className="font-medium text-blue-600 hover:underline">{d.supplier.name}</Link>
                      <p className="text-xs text-muted-foreground">{d.itemsDescription || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/jobs/${d.job.id}`} className="hover:underline hover:text-blue-600">{d.job.name}</Link>
                        {" · "}{d.job.plot.plotNumber ? `Plot ${d.job.plot.plotNumber}` : d.job.plot.name}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                      disabled={pendingOrderActions.has(d.id)}
                      onClick={() => handleOrderAction(d.id, "DELIVERED")}
                    >
                      {pendingOrderActions.has(d.id) ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                      <span className="ml-1">Received</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue items */}
        {(data.overdueJobs.length > 0 || data.overdueDeliveries.length > 0) && (
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="size-4" />
                Overdue ({data.overdueJobs.length} jobs, {data.overdueDeliveries.length} deliveries)
                {!bulkMode && (() => {
                  const completable = data.overdueJobs.filter((j) => j.status === "IN_PROGRESS");
                  return completable.length > 1 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-6 gap-1 border-red-200 px-2 text-[10px] text-red-700 hover:bg-red-50"
                      disabled={bulkProcessing}
                      onClick={() => handleQuickBulk(completable.map((j) => j.id), "complete")}
                    >
                      {bulkProcessing ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-2.5" />}
                      Complete All ({completable.length})
                    </Button>
                  ) : null;
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.overdueJobs.slice(0, 10).map((j) => renderJobRow(j))}
                {data.overdueJobs.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    +{data.overdueJobs.length - 10} more overdue jobs
                  </p>
                )}
                {data.overdueDeliveries.length > 0 && (
                  <>
                    {data.overdueJobs.length > 0 && <div className="border-t pt-2" />}
                    {data.overdueDeliveries.map((d) => (
                      <div key={d.id} className="flex items-start justify-between gap-2 rounded border border-red-100 bg-red-50/40 p-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Package className="size-3 shrink-0 text-red-600" />
                            <Link href={`/suppliers/${d.supplier.id}`} className="font-medium text-blue-600 hover:underline">{d.supplier.name}</Link>
                          </div>
                          <p className="text-xs text-muted-foreground">{d.itemsDescription || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            <Link href={`/jobs/${d.job.id}`} className="hover:underline hover:text-blue-600">{d.job.name}</Link>
                            {" · "}{d.job.plot.plotNumber ? `Plot ${d.job.plot.plotNumber}` : d.job.plot.name}
                            {d.expectedDeliveryDate && (
                              <span className="ml-1 font-medium text-red-600">
                                · Due {format(new Date(d.expectedDeliveryDate), "dd MMM")}
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                          disabled={pendingOrderActions.has(d.id)}
                          onClick={() => handleOrderAction(d.id, "DELIVERED")}
                        >
                          {pendingOrderActions.has(d.id) ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                          <span className="ml-1">Received</span>
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jobs starting tomorrow */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-indigo-600" />
              Starting Tomorrow ({data.jobsStartingTomorrow.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobsStartingTomorrow.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs starting tomorrow</p>
            ) : (
              <div className="space-y-2">
                {data.jobsStartingTomorrow.map((j) => renderJobRow(j, false))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders to Place */}
      {data.ordersToPlace.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-violet-600" />
              Orders to Place ({data.ordersToPlace.length})
            </CardTitle>
            <CardDescription className="text-xs">Orders created but not yet sent to supplier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.ordersToPlace.map((o) => {
                const isPendingAction = pendingOrderActions.has(o.id);
                const mailto = o.supplier.contactEmail
                  ? `mailto:${encodeURIComponent(o.supplier.contactEmail)}?subject=${encodeURIComponent(`Material Order — ${o.job.plot.plotNumber ? `Plot ${o.job.plot.plotNumber}` : o.job.plot.name}`)}&body=${encodeURIComponent(`Hi ${o.supplier.contactName || o.supplier.name},\n\nPlease supply the following for ${o.job.name}:\n\n${o.itemsDescription || "Materials as discussed"}${o.expectedDeliveryDate ? `\n\nRequired by: ${format(new Date(o.expectedDeliveryDate), "dd MMM yyyy")}` : ""}\n\nPlease confirm receipt.\n\nRegards`)}`
                  : null;
                return (
                  <div key={o.id} className="flex items-start justify-between gap-2 rounded border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/suppliers/${o.supplier.id}`} className="truncate font-medium text-blue-600 hover:underline">
                          {o.supplier.name}
                        </Link>
                        {o.expectedDeliveryDate && (
                          <span className="text-[10px] text-muted-foreground">
                            needed {format(new Date(o.expectedDeliveryDate), "dd MMM")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{o.itemsDescription || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/jobs/${o.job.id}`} className="hover:underline hover:text-blue-600">{o.job.name}</Link>
                        {" · "}{o.job.plot.plotNumber ? `Plot ${o.job.plot.plotNumber}` : o.job.plot.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isPendingAction ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {mailto && (
                            <Button variant="outline" size="sm" className="h-6 border-violet-200 px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                              onClick={() => { window.open(mailto, "_blank"); handleOrderAction(o.id, "ORDERED"); }}>
                              <Mail className="mr-1 size-2.5" />Send Order
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-6 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                            onClick={() => handleOrderAction(o.id, "ORDERED")}>
                            <Package className="mr-1 size-2.5" />{mailto ? "Mark Sent" : "Place Order"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open snags */}
      {data.openSnagsList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bug className="size-4 text-orange-600" />
              Open Snags ({data.summary.openSnagCount})
              {data.summary.openSnagCount > 20 && (
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">Showing top 20</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.openSnagsList.map((snag) => {
                const isPendingSnag = pendingSnagActions.has(snag.id);
                return (
                  <div
                    key={snag.id}
                    className={`rounded border p-2 text-sm ${
                      snag.priority === "CRITICAL" ? "border-red-200 bg-red-50" :
                      snag.priority === "HIGH" ? "border-orange-200 bg-orange-50/60" :
                      ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/sites/${snag.plot.siteId}/plots/${snag.plotId}`}
                          className="font-medium leading-snug text-blue-600 hover:underline"
                        >
                          {snag.description}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <Link href={`/sites/${snag.plot.siteId}/plots/${snag.plotId}`} className="hover:underline hover:text-blue-600">
                            {snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name}
                          </Link>
                          {snag.location && (
                            <span> · <MapPin className="inline size-3" /> {snag.location}</span>
                          )}
                          {snag.assignedTo && <span> · {snag.assignedTo.name}</span>}
                          {snag.contact && <span> · {snag.contact.company || snag.contact.name}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            snag.priority === "CRITICAL" ? "border-red-300 text-red-700" :
                            snag.priority === "HIGH" ? "border-orange-300 text-orange-700" :
                            snag.priority === "MEDIUM" ? "border-yellow-300 text-yellow-700" :
                            "border-slate-200 text-slate-600"
                          }`}
                        >
                          {snag.priority}
                        </Badge>
                        {isPendingSnag ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : snag.status === "OPEN" ? (
                          <Button variant="outline" size="sm" className="h-6 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                            onClick={() => handleSnagAction(snag.id, "IN_PROGRESS")}>
                            <Play className="mr-1 size-2.5" />Start
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-6 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                            onClick={() => handleSnagAction(snag.id, "RESOLVED")}>
                            <CheckCircle2 className="mr-1 size-2.5" />Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      {data.recentEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-slate-600" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.recentEvents.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(e.createdAt), "HH:mm")}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    {e.description}
                  </span>
                  {e.user && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {e.user.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rained Off Dialog (UX #4) */}
      <Dialog open={rainedOffDialogOpen} onOpenChange={setRainedOffDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudRain className="size-5" />
              Mark as Rained Off
            </DialogTitle>
            <DialogDescription>
              Record this day as rained off. Optionally add notes and delay affected jobs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rain-note">Notes (optional)</Label>
              <Textarea
                id="rain-note"
                value={rainedOffNote}
                onChange={(e) => setRainedOffNote(e.target.value)}
                placeholder="e.g. Heavy rain from 7am, site flooded"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rainedOffDelay}
                onChange={(e) => setRainedOffDelay(e.target.checked)}
                className="size-4 accent-blue-600"
              />
              Delay weather-affected jobs by 1 day
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleMarkRainedOff} disabled={savingRainedOff}>
              {savingRainedOff ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Confirm Rained Off"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Job Dialog */}
      <Dialog open={!!extendTarget} onOpenChange={(open) => { if (!open) { setExtendTarget(null); setExtendPreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Job</DialogTitle>
            <DialogDescription>
              Extend &ldquo;{extendTarget?.name}&rdquo; and shift all downstream jobs on this plot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Extend by (days)</label>
              <Input
                type="number"
                min={1}
                value={extendDays}
                onChange={(e) => { setExtendDays(Math.max(1, parseInt(e.target.value) || 1)); setExtendPreview(null); }}
                className="mt-1"
              />
            </div>
            {extendTarget?.endDate && (
              <p className="text-xs text-muted-foreground">
                Current end: {format(new Date(extendTarget.endDate), "d MMM yyyy")} → New end: {format(addDays(new Date(extendTarget.endDate), extendDays), "d MMM yyyy")}
              </p>
            )}
            {extendPreview && (
              <div className="rounded bg-orange-50 p-2 text-xs">
                <p className="font-medium text-orange-800">
                  +{extendPreview.deltaDays} day{extendPreview.deltaDays !== 1 ? "s" : ""} — {extendPreview.jobUpdates.length} downstream job{extendPreview.jobUpdates.length !== 1 ? "s" : ""} and {extendPreview.orderUpdates.length} order{extendPreview.orderUpdates.length !== 1 ? "s" : ""} will shift
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            {!extendPreview ? (
              <Button onClick={handleExtendPreview} disabled={extendLoading} size="sm">
                {extendLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Preview
              </Button>
            ) : (
              <Button onClick={handleExtendConfirm} disabled={extendLoading} size="sm">
                {extendLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Confirm Extension
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cascade after Complete Dialog */}
      <Dialog open={!!cascadeTarget} onOpenChange={(open) => { if (!open) { setCascadeTarget(null); setCascadePreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift Plot Programme?</DialogTitle>
            <DialogDescription>
              &ldquo;{cascadeTarget?.jobName}&rdquo; finished{" "}
              {cascadeTarget && Math.abs(cascadeTarget.deltaDays)} day{cascadeTarget && Math.abs(cascadeTarget.deltaDays) !== 1 ? "s" : ""}{" "}
              {cascadeTarget && cascadeTarget.deltaDays > 0 ? "late" : "early"}.
              Would you like to shift the remaining jobs on this plot?
            </DialogDescription>
          </DialogHeader>
          {cascadePreview && (
            <div className="rounded bg-blue-50 p-2 text-xs">
              <p className="font-medium text-blue-800">
                {cascadePreview.deltaDays > 0 ? "+" : ""}{cascadePreview.deltaDays} day{Math.abs(cascadePreview.deltaDays) !== 1 ? "s" : ""} — {cascadePreview.jobUpdates.length} job{cascadePreview.jobUpdates.length !== 1 ? "s" : ""} and {cascadePreview.orderUpdates.length} order{cascadePreview.orderUpdates.length !== 1 ? "s" : ""} will shift
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCascadeTarget(null); setCascadePreview(null); }}>
              No, Keep As Is
            </Button>
            <Button onClick={handleCascadeConfirm} disabled={cascadeLoading || !cascadePreview} size="sm">
              {cascadeLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Yes, Shift Programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
