"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";
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
  Lock,
  Mail,
  Camera,
  FileCheck,
  ChevronDown,
  Printer,
  UserPlus,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    lateStartCount: number;
    blockedCount: number;
    openSnagCount: number;
    awaitingRestartCount: number;
  };
  awaitingRestartPlots: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    nextJob: {
      id: string;
      name: string;
      startDate: string | null;
      contractorName: string | null;
      assignedToName: string | null;
    } | null;
  }>;
  blockedJobs: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    blockedBy: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  lateStartJobs: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
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
  openSnagsTruncated: boolean;
  ordersToPlace: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  upcomingOrders: Array<{
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
  needsAttention: Array<{
    id: string;
    type: "snag" | "job" | "order";
    title: string;
    subtitle: string;
    missing: string[];
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
  const [upcomingOrdersOpen, setUpcomingOrdersOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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

  // Push/Delay dialog state (for late-start jobs)
  const [pushTarget, setPushTarget] = useState<{ id: string; name: string; startDate: string | null; endDate: string | null } | null>(null);
  const [pushDays, setPushDays] = useState(1);
  const [pushLoading, setPushLoading] = useState(false);

  // Snag & order inline actions
  const [pendingSnagActions, setPendingSnagActions] = useState<Set<string>>(new Set());
  const [pendingOrderActions, setPendingOrderActions] = useState<Set<string>>(new Set());

  // Snag resolve dialog state (P5)
  const [snagResolveTarget, setSnagResolveTarget] = useState<{
    id: string;
    description: string;
    plot: { plotNumber: string | null; name: string; siteId: string };
  } | null>(null);
  const [snagResolvePhotos, setSnagResolvePhotos] = useState<File[]>([]);
  const [snagResolvePreviews, setSnagResolvePreviews] = useState<string[]>([]);
  const [snagResolveSubmitting, setSnagResolveSubmitting] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Budget summary (P6)
  const [budgetSummary, setBudgetSummary] = useState<{
    totalBudgeted: number;
    totalActual: number;
    totalDelivered: number;
    totalCommitted: number;
    totalVariance: number;
    variancePercent: number;
  } | null>(null);
  const [budgetPlots, setBudgetPlots] = useState<Array<{
    plotId: string;
    plotNumber: string | null;
    plotName: string;
    budgeted: number;
    delivered: number;
    committed: number;
    variance: number;
    variancePercent: number;
  }>>([]);

  // Sign-off dialog state
  const [signOffTarget, setSignOffTarget] = useState<{
    id: string;
    name: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  } | null>(null);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signOffPhotos, setSignOffPhotos] = useState<File[]>([]);
  const [signOffPreviews, setSignOffPreviews] = useState<string[]>([]);
  const [signOffSubmitting, setSignOffSubmitting] = useState(false);

  // Post-completion decision dialog state
  const [completionContext, setCompletionContext] = useState<{
    completedJobName: string;
    daysDeviation: number;
    nextJob: { id: string; name: string; contractorName: string | null; assignedToName: string | null } | null;
    plotId: string;
  } | null>(null);

  // Contractor quick-assign state
  const [contractorAssignTarget, setContractorAssignTarget] = useState<{ jobId: string; jobName: string } | null>(null);
  const [availableContractors, setAvailableContractors] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [assigningContractor, setAssigningContractor] = useState(false);

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

  // Fetch budget summary once on mount (independent of date)
  useEffect(() => {
    fetch(`/api/sites/${siteId}/budget-report`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setBudgetSummary(d.siteSummary);
          setBudgetPlots(d.plots || []);
        }
      })
      .catch(() => null);
  }, [siteId]);

  // Open sections that have content; empty ones stay collapsed; recent-activity always closed
  useEffect(() => {
    if (!data) return;
    const open = new Set<string>();
    if (data.jobsStartingToday.length > 0) open.add("starting-today");
    if (data.jobsDueToday.length > 0) open.add("finishing-today");
    if (data.deliveriesToday.length > 0) open.add("deliveries");
    if (data.lateStartJobs.length > 0) open.add("late-starts");
    if (data.overdueJobs.length > 0 || data.overdueDeliveries.length > 0) open.add("overdue");
    if (data.jobsStartingTomorrow.length > 0) open.add("starting-tomorrow");
    if (data.ordersToPlace.length > 0) open.add("orders-to-place");
    if (data.openSnagsList.length > 0) open.add("snags");
    // upcoming-orders uses its own upcomingOrdersOpen state (always collapsed)
    // recent-activity always collapsed — not added
    setOpenSections(open);
  }, [data]);

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
              // cascade preview failure is non-critical, dialog still opens
            }
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `Failed to ${action} job`);
      }
    } catch {
      showToast("Network error — please try again");
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
      showToast("Could not load job details — please try again");
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
      } else {
        showToast("Could not calculate extension preview");
      }
    } catch {
      showToast("Network error — please try again");
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
      } else {
        showToast("Failed to extend job — please try again");
      }
    } catch {
      showToast("Network error — please try again");
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
      } else {
        showToast("Failed to shift programme — please try again");
      }
    } catch {
      showToast("Network error — please try again");
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
      showToast("Failed to mark rained off — please try again");
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

  // Snag resolve dialog handlers (P5)
  const handleSnagResolveOpen = (snag: { id: string; description: string; plot: { plotNumber: string | null; name: string; siteId: string } }) => {
    setSnagResolveTarget(snag);
    setSnagResolvePhotos([]);
    setSnagResolvePreviews([]);
  };

  const handleSnagResolvePhotosChange = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setSnagResolvePhotos((prev) => [...prev, ...arr]);
    setSnagResolvePreviews((prev) => [...prev, ...arr.map((f) => URL.createObjectURL(f))]);
  };

  const removeSnagResolvePhoto = (index: number) => {
    URL.revokeObjectURL(snagResolvePreviews[index]);
    setSnagResolvePhotos((prev) => prev.filter((_, i) => i !== index));
    setSnagResolvePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSnagResolveSubmit = async () => {
    if (!snagResolveTarget) return;
    setSnagResolveSubmitting(true);
    try {
      if (snagResolvePhotos.length > 0) {
        const fd = new FormData();
        snagResolvePhotos.forEach((f) => fd.append("photos", f));
        fd.append("tag", "after");
        await fetch(`/api/snags/${snagResolveTarget.id}/photos`, { method: "POST", body: fd });
      }
      const res = await fetch(`/api/snags/${snagResolveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      if (res.ok) {
        snagResolvePreviews.forEach((url) => URL.revokeObjectURL(url));
        setSnagResolveTarget(null);
        setSnagResolvePhotos([]);
        setSnagResolvePreviews([]);
        setRefreshKey((k) => k + 1);
        showToast("Snag resolved", "success");
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to resolve snag");
      }
    } catch {
      showToast("Network error — please try again");
    } finally {
      setSnagResolveSubmitting(false);
    }
  };

  const handleSnagAction = async (snagId: string, status: string) => {
    setPendingSnagActions((prev) => new Set(prev).add(snagId));
    try {
      const res = await fetch(`/api/snags/${snagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else {
        showToast("Failed to update snag — please try again");
      }
    } catch {
      showToast("Network error — please try again");
    } finally {
      setPendingSnagActions((prev) => { const n = new Set(prev); n.delete(snagId); return n; });
    }
  };

  const handlePushJob = async () => {
    if (!pushTarget) return;
    setPushLoading(true);
    try {
      const newStartDate = pushTarget.startDate
        ? addDays(new Date(pushTarget.startDate), pushDays).toISOString()
        : null;
      const newEndDate = pushTarget.endDate
        ? addDays(new Date(pushTarget.endDate), pushDays).toISOString()
        : null;
      await fetch(`/api/jobs/${pushTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: newStartDate, endDate: newEndDate }),
      });
      // Also cascade end date change to dependent jobs
      if (newEndDate) {
        await fetch(`/api/jobs/${pushTarget.id}/cascade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate }),
        });
      }
      setPushTarget(null);
      setRefreshKey((k) => k + 1);
    } catch {
      showToast("Failed to push job dates — please try again");
    } finally {
      setPushLoading(false);
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
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else {
        showToast("Failed to update order — please try again");
      }
    } catch {
      showToast("Network error — please try again");
    } finally {
      setPendingOrderActions((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  };

  // Sign-off dialog handlers
  const handleOpenSignOff = (job: { id: string; name: string; plot: { plotNumber: string | null; name: string }; assignedTo: { name: string } | null }) => {
    setSignOffTarget(job);
    setSignOffNotes("");
    setSignOffPhotos([]);
    setSignOffPreviews([]);
  };

  const handleSignOffPhotosChange = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setSignOffPhotos((prev) => [...prev, ...arr]);
    setSignOffPreviews((prev) => [...prev, ...arr.map((f) => URL.createObjectURL(f))]);
  };

  const removeSignOffPhoto = (index: number) => {
    URL.revokeObjectURL(signOffPreviews[index]);
    setSignOffPhotos((prev) => prev.filter((_, i) => i !== index));
    setSignOffPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSignOffSubmit = async () => {
    if (!signOffTarget) return;
    setSignOffSubmitting(true);
    try {
      if (signOffPhotos.length > 0) {
        const fd = new FormData();
        signOffPhotos.forEach((f) => fd.append("photos", f));
        fd.append("tag", "after");
        await fetch(`/api/jobs/${signOffTarget.id}/photos`, { method: "POST", body: fd });
      }
      const res = await fetch(`/api/jobs/${signOffTarget.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", signOffNotes: signOffNotes.trim() || undefined }),
      });
      if (res.ok) {
        const result = await res.json();
        signOffPreviews.forEach((url) => URL.revokeObjectURL(url));
        setSignOffTarget(null);
        setRefreshKey((k) => k + 1);
        // Show post-completion decision dialog
        if (result._completionContext) {
          setCompletionContext(result._completionContext);
        } else if (result.endDate && result.actualEndDate) {
          // Fallback: legacy cascade dialog
          const delta = differenceInCalendarDays(new Date(result.actualEndDate), new Date(result.endDate));
          if (delta !== 0) {
            setCascadeTarget({ jobId: signOffTarget.id, jobName: signOffTarget.name, deltaDays: delta, endDate: result.endDate, actualEndDate: result.actualEndDate });
            try {
              const previewRes = await fetch(`/api/jobs/${signOffTarget.id}/cascade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newEndDate: result.actualEndDate }) });
              if (previewRes.ok) setCascadePreview(await previewRes.json());
            } catch {
              // cascade preview failure is non-critical
            }
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to sign off job");
      }
    } catch {
      showToast("Network error — please try again");
    } finally {
      setSignOffSubmitting(false);
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
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else {
        showToast("Bulk action failed — please try again");
      }
    } catch {
      showToast("Network error — please try again");
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
      } else {
        showToast("Bulk action failed — please try again");
      }
    } catch {
      showToast("Network error — please try again");
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

  // Contractor quick-assign handlers
  const handleContractorAssignOpen = async (jobId: string, jobName: string) => {
    setContractorAssignTarget({ jobId, jobName });
    setSelectedContractorId("");
    try {
      const res = await fetch("/api/contacts?type=CONTRACTOR");
      if (res.ok) {
        const data = await res.json();
        setAvailableContractors(data);
      }
    } catch {
      // silently fail — user can close dialog
    }
  };

  const handleContractorAssign = async () => {
    if (!contractorAssignTarget || !selectedContractorId) return;
    setAssigningContractor(true);
    try {
      const res = await fetch(`/api/jobs/${contractorAssignTarget.jobId}/contractors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [selectedContractorId] }),
      });
      if (res.ok) {
        setContractorAssignTarget(null);
        setSelectedContractorId("");
        fetchData();
      }
    } finally {
      setAssigningContractor(false);
    }
  };

  // Job row renderer with action buttons + optional checkbox
  const renderJobRow = (
    j: { id: string; name: string; status: string; plot: { plotNumber: string | null; name: string }; assignedTo?: { name: string } | null; endDate?: string | null; contractors?: Array<{ contact: { name: string; company: string | null } }> },
    showAction = true,
    showContractorAssign = false
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
          {showContractorAssign && (!j.contractors || j.contractors.length === 0) && (
            <button
              className="ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleContractorAssignOpen(j.id, j.name); }}
              title="Assign contractor"
            >
              <UserPlus className="size-3" />
            </button>
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
          <Button
            variant="outline"
            size="sm"
            className="no-print"
            onClick={() => window.print()}
            title="Print daily brief"
          >
            <Printer className="size-3.5" />
            <span className="hidden sm:inline ml-1">Print</span>
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

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Progress", value: `${s.progressPercent}%`, sub: `${s.completedJobs}/${s.totalJobs} jobs`, color: "text-foreground", anchor: null },
          { label: "Starting Today", value: data.jobsStartingToday.length, color: "text-green-600", anchor: "section-starting-today" },
          { label: "Finishing Today", value: data.jobsDueToday.length, color: "text-emerald-600", anchor: "section-finishing-today" },
          { label: "Late Starts", value: s.lateStartCount, color: s.lateStartCount > 0 ? "text-red-600" : "text-green-600", anchor: "section-late-starts" },
          { label: "Blocked", value: s.blockedCount, color: s.blockedCount > 0 ? "text-slate-500" : "text-green-600", anchor: "section-blocked" },
          { label: "Overdue", value: `${s.overdueJobCount}`, color: s.overdueJobCount > 0 ? "text-red-600" : "text-green-600", anchor: "section-overdue" },
          { label: "Deliveries", value: data.deliveriesToday.length, color: "text-blue-600", anchor: "section-deliveries" },
          { label: "Orders to Place", value: data.ordersToPlace.length, color: data.ordersToPlace.length > 0 ? "text-amber-600" : "text-green-600", anchor: "section-orders" },
          { label: "Open Snags", value: s.openSnagCount, color: s.openSnagCount > 0 ? "text-orange-600" : "text-green-600", anchor: "section-snags" },
          { label: "Needs Attention", value: String(data.needsAttention?.length || 0), color: (data.needsAttention?.length || 0) > 0 ? "text-amber-600" : "text-green-600", anchor: "section-needs-attention" },
        ].map(({ label, value, sub, color, anchor }) => {
          const inner = (
            <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 shadow-sm">
              <span className={`text-lg font-bold leading-none ${color}`}>{value}</span>
              <div>
                <p className="text-[11px] font-medium leading-tight text-foreground">{label}</p>
                {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
              </div>
            </div>
          );
          return anchor ? (
            <a key={label} href={`#${anchor}`} className="no-underline hover:opacity-80 transition-opacity">
              {inner}
            </a>
          ) : (
            <div key={label}>{inner}</div>
          );
        })}
      </div>

      {/* Budget / Cost burn card (P6) */}
      {budgetSummary && budgetSummary.totalBudgeted > 0 && (() => {
        const variance = budgetSummary.totalVariance;
        const pct = budgetSummary.variancePercent;
        const rag =
          pct > 10 ? "red" :
          pct > 5 ? "amber" :
          pct < -5 ? "green" : "green";
        const ragColors = {
          red: "border-red-300 bg-red-50/40",
          amber: "border-amber-300 bg-amber-50/40",
          green: "border-green-300 bg-green-50/40",
        };
        const ragTextColors = {
          red: "text-red-700",
          amber: "text-amber-700",
          green: "text-green-700",
        };
        const fmt = (n: number) =>
          new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
        return (
          <Card className={ragColors[rag]}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Budget</p>
                  <p className="text-lg font-bold">{fmt(budgetSummary.totalBudgeted)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Delivered</p>
                  <p className="text-lg font-bold">{fmt(budgetSummary.totalDelivered ?? budgetSummary.totalActual)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Committed</p>
                  <p className="text-sm font-semibold text-muted-foreground">{fmt(budgetSummary.totalCommitted ?? budgetSummary.totalActual)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Variance</p>
                  <p className={`text-lg font-bold ${ragTextColors[rag]}`}>
                    {variance > 0 ? "+" : ""}{fmt(variance)} ({pct > 0 ? "+" : ""}{pct}%)
                  </p>
                </div>
                <div className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
                  rag === "red" ? "bg-red-100 text-red-700" :
                  rag === "amber" ? "bg-amber-100 text-amber-700" :
                  "bg-green-100 text-green-700"
                }`}>
                  {rag === "red" ? "OVER BUDGET" : rag === "amber" ? "WATCH" : "ON BUDGET"}
                </div>
              </div>
              {/* Per-plot budget breakdown (F5) */}
              {budgetPlots.length > 0 && (
                <details className="mt-3 border-t pt-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    View per-plot breakdown ({budgetPlots.length} plots)
                  </summary>
                  <div className="mt-2 max-h-60 overflow-y-auto rounded border text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Plot</th>
                          <th className="px-2 py-1 text-right font-medium">Budget</th>
                          <th className="px-2 py-1 text-right font-medium">Delivered</th>
                          <th className="px-2 py-1 text-right font-medium">Committed</th>
                          <th className="px-2 py-1 text-right font-medium">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetPlots.map((p) => (
                          <tr key={p.plotId} className="border-t">
                            <td className="px-2 py-1">{p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName}</td>
                            <td className="px-2 py-1 text-right">{fmt(p.budgeted)}</td>
                            <td className="px-2 py-1 text-right">{fmt(p.delivered)}</td>
                            <td className="px-2 py-1 text-right">{fmt(p.committed)}</td>
                            <td className={`px-2 py-1 text-right ${p.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                              {p.variance > 0 ? "+" : ""}{fmt(p.variance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
        <Card id="section-starting-today">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("starting-today")}>
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
                    onClick={(e) => { e.stopPropagation(); handleQuickBulk(startable.map((j) => j.id), "start"); }}
                  >
                    {bulkProcessing ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-2.5" />}
                    Start All ({startable.length})
                  </Button>
                ) : null;
              })()}
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("starting-today") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("starting-today") && (
            <CardContent>
              {data.jobsStartingToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs starting today</p>
              ) : (
                <div className="space-y-2">
                  {data.jobsStartingToday.map((j) => renderJobRow(j, true, true))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Jobs finishing today — sign-off */}
        <Card id="section-finishing-today">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("finishing-today")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileCheck className="size-4 text-emerald-600" />
              Finishing Today ({data.jobsDueToday.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("finishing-today") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Jobs scheduled to complete — sign off with notes &amp; photos</CardDescription>
          </CardHeader>
          {openSections.has("finishing-today") && (
            <CardContent>
            {data.jobsDueToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs finishing today</p>
            ) : (
              <div className="space-y-2">
                {data.jobsDueToday.map((j) => (
                  <div key={j.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                        {j.status !== "NOT_STARTED" && (
                          <Badge variant={j.status === "IN_PROGRESS" ? "default" : j.status === "COMPLETED" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                            {j.status.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                        {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
                      </p>
                    </div>
                    {j.status === "COMPLETED" ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-emerald-600">
                        <Check className="size-3" /> Signed Off
                      </span>
                    ) : pendingActions.has(j.id) ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50"
                          onClick={() => handleExtendOpen(j.id)}
                        >
                          <Clock className="size-2.5" /> Extend
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700"
                          onClick={() => handleOpenSignOff(j)}
                        >
                          <FileCheck className="size-3" />
                          Sign Off
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </CardContent>
          )}
        </Card>

        {/* Deliveries expected */}
        <Card id="section-deliveries">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("deliveries")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="size-4 text-blue-600" />
              Deliveries Today ({data.deliveriesToday.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("deliveries") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("deliveries") && (
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
          )}
        </Card>

        {/* Late starts — NOT_STARTED jobs whose start date has passed */}
        <Card id="section-late-starts" className={data.lateStartJobs.length > 0 ? "border-amber-200" : ""}>
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("late-starts")}>
            <CardTitle className={cn("flex items-center gap-2 text-sm", data.lateStartJobs.length > 0 ? "text-amber-700" : "")}>
              <Clock className="size-4" />
              Late Starts ({data.lateStartJobs.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("late-starts") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Jobs that should have started but haven&apos;t been actioned</CardDescription>
          </CardHeader>
          {openSections.has("late-starts") && (
            <CardContent>
              {data.lateStartJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No late starts</p>
              ) : (
                <div className="space-y-2">
                  {data.lateStartJobs.map((j) => (
                    <div key={j.id} className="flex items-center gap-2 rounded border border-amber-100 bg-amber-50/50 p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                          {j.assignedTo && <span> · {j.assignedTo.name}</span>}
                          {j.startDate && <span className="text-amber-700"> · Should have started {format(new Date(j.startDate), "dd MMM")}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50" disabled={pendingActions.has(j.id)} onClick={() => handleJobAction(j.id, "start")}>
                          <Play className="size-2.5" /> Start Now
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50" onClick={() => { setPushTarget(j); setPushDays(differenceInCalendarDays(date, j.startDate ? new Date(j.startDate) : date) || 1); }}>
                          <CalendarClock className="size-2.5" /> Push
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Blocked jobs — late starts that are waiting on a predecessor */}
        {data.blockedJobs && data.blockedJobs.length > 0 && (
          <Card id="section-blocked" className="border-slate-200">
            <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("blocked")}>
              <CardTitle className={cn("flex items-center gap-2 text-sm text-slate-500")}>
                <Lock className="size-4" />
                Blocked Jobs ({data.blockedJobs.length})
                <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("blocked") && "rotate-180")} />
              </CardTitle>
              <CardDescription className="text-xs">Jobs that can&apos;t start yet because a predecessor job isn&apos;t complete</CardDescription>
            </CardHeader>
            {openSections.has("blocked") && (
              <CardContent>
                <div className="space-y-2">
                  {data.blockedJobs.map((j) => (
                    <div key={j.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50/50 p-2 text-sm opacity-70">
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-slate-600 hover:underline">{j.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                          {j.assignedTo && <span> &middot; {j.assignedTo.name}</span>}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Lock className="size-3" /> Blocked by: {j.blockedBy}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Overdue items */}
        {(data.overdueJobs.length > 0 || data.overdueDeliveries.length > 0) && (
          <Card id="section-overdue" className="border-red-200">
            <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("overdue")}>
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
                      onClick={(e) => { e.stopPropagation(); handleQuickBulk(completable.map((j) => j.id), "complete"); }}
                    >
                      {bulkProcessing ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-2.5" />}
                      Complete All ({completable.length})
                    </Button>
                  ) : null;
                })()}
                <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("overdue") && "rotate-180")} />
              </CardTitle>
            </CardHeader>
            {openSections.has("overdue") && (
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
            )}
          </Card>
        )}

        {/* Jobs starting tomorrow */}
        <Card id="section-starting-tomorrow">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("starting-tomorrow")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-indigo-600" />
              Starting Tomorrow ({data.jobsStartingTomorrow.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("starting-tomorrow") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("starting-tomorrow") && (
            <CardContent>
              {data.jobsStartingTomorrow.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs starting tomorrow</p>
              ) : (
                <div className="space-y-2">
                  {data.jobsStartingTomorrow.map((j) => renderJobRow(j, false))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Orders to Place */}
      {data.ordersToPlace.length > 0 && (
        <Card id="section-orders">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("orders-to-place")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-violet-600" />
              Orders to Place ({data.ordersToPlace.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("orders-to-place") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Orders created but not yet sent to supplier</CardDescription>
          </CardHeader>
          {openSections.has("orders-to-place") && (
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
          )}
        </Card>
      )}

      {/* Upcoming Orders (future, scheduled) — collapsible */}
      {data.upcomingOrders.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => setUpcomingOrdersOpen((o) => !o)}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-slate-500" />
              Upcoming Orders ({data.upcomingOrders.length})
              <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-200", upcomingOrdersOpen && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Orders scheduled for future placement — click to expand</CardDescription>
          </CardHeader>
          {upcomingOrdersOpen && (
          <CardContent>
            <div className="space-y-2">
              {data.upcomingOrders.map((o) => {
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
          )}
        </Card>
      )}

      {/* Open snags */}
      {data.openSnagsList.length > 0 && (
        <Card id="section-snags">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("snags")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bug className="size-4 text-orange-600" />
              Open Snags ({data.summary.openSnagCount})
              {data.openSnagsTruncated && (
                <span className="text-[10px] font-normal text-muted-foreground">Showing top 20 of {data.summary.openSnagCount}</span>
              )}
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("snags") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("snags") && (
            <CardContent>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {data.openSnagsTruncated && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Showing 20 of {data.summary.openSnagCount} open snags.{" "}
                  <Link href={`/sites/${siteId}?tab=snags`} className="text-blue-600 hover:underline">View all in Snags tab →</Link>
                </p>
              )}
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
                          href={`/sites/${siteId}?tab=snags&snagId=${snag.id}`}
                          className="font-medium leading-snug text-blue-600 hover:underline"
                        >
                          {snag.description}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <Link href={`/sites/${siteId}?tab=snags&snagId=${snag.id}`} className="hover:underline hover:text-blue-600">
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
                            onClick={() => handleSnagResolveOpen(snag)}>
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
          )}
        </Card>
      )}

      {/* Needs Attention — all incomplete items across the site */}
      {data.needsAttention && data.needsAttention.length > 0 && (
        <Card id="section-needs-attention">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="size-4 text-amber-500" />
              <span className="text-sm font-semibold">
                Needs Attention ({data.needsAttention.length})
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Items with missing information — click to resolve
            </p>
            <div className="space-y-2">
              {data.needsAttention.map((item) => {
                const href =
                  item.type === "snag"
                    ? `/sites/${siteId}?tab=snags&snagId=${item.id}`
                    : item.type === "job"
                      ? `/jobs/${item.id}`
                      : `/orders`;
                const TypeIcon =
                  item.type === "snag" ? Bug : item.type === "job" ? Briefcase : Package;
                return (
                  <a
                    key={`${item.type}-${item.id}`}
                    href={href}
                    className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/50 p-3 no-underline hover:bg-amber-50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <TypeIcon className="size-3.5 text-amber-600 shrink-0" />
                      <p className="text-sm font-medium text-foreground line-clamp-1">{item.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.missing.map((m) => (
                        <span key={m} className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          <AlertTriangle className="size-2.5" />
                          {m}
                        </span>
                      ))}
                    </div>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awaiting Restart — plots where "leave for now" was chosen */}
      {data.awaitingRestartPlots && data.awaitingRestartPlots.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("awaiting-restart")}>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
              <PauseCircle className="size-4" />
              Plots Awaiting Decision ({data.awaitingRestartPlots.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("awaiting-restart") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs text-amber-600/80">
              These plots are inactive — next job needs a start decision
            </CardDescription>
          </CardHeader>
          {openSections.has("awaiting-restart") && (
            <CardContent className="space-y-3">
              {data.awaitingRestartPlots.map((p: { id: string; plotNumber: string | null; name: string; nextJob: { id: string; name: string; contractorName: string | null; assignedToName: string | null } | null }) => (
                <div key={p.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                    </p>
                    {p.nextJob && (
                      <span className="text-xs text-muted-foreground">{p.nextJob.name}</span>
                    )}
                  </div>
                  {p.nextJob && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setCompletionContext({ completedJobName: "", daysDeviation: 0, nextJob: p.nextJob, plotId: p.id })}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                      >
                        <PlayCircle className="size-3" /> Start today
                      </button>
                      <button
                        onClick={() => setCompletionContext({ completedJobName: "", daysDeviation: 0, nextJob: p.nextJob, plotId: p.id })}
                        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      >
                        <CalendarDays className="size-3" /> Reschedule…
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Recent activity — always collapsed by default */}
      {data.recentEvents.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("recent-activity")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-slate-600" />
              Recent Activity ({data.recentEvents.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("recent-activity") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("recent-activity") && (
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
          )}
        </Card>
      )}

      {/* Push/Delay Dialog for late-start jobs */}
      <Dialog open={!!pushTarget} onOpenChange={(o) => !o && setPushTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Push Job Forward</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{pushTarget?.name}</span> was due to start{" "}
              {pushTarget?.startDate ? format(new Date(pushTarget.startDate), "dd MMM") : "earlier"}.
              Shift its start and end dates forward by:
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <Input
              type="number"
              min={1}
              max={90}
              value={pushDays}
              onChange={(e) => setPushDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">days</span>
            {pushTarget?.startDate && pushTarget?.endDate && (
              <span className="text-xs text-muted-foreground">
                → {format(addDays(new Date(pushTarget.startDate), pushDays), "dd MMM")} – {format(addDays(new Date(pushTarget.endDate), pushDays), "dd MMM")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Dependent jobs will also be shifted via cascade.</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={pushLoading} onClick={handlePushJob}>
              {pushLoading ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
              Push {pushDays} day{pushDays !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Sign Off Dialog */}
      <Dialog
        open={!!signOffTarget}
        onOpenChange={(open) => {
          if (!open) {
            signOffPreviews.forEach((url) => URL.revokeObjectURL(url));
            setSignOffTarget(null);
            setSignOffPhotos([]);
            setSignOffPreviews([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="size-5 text-emerald-600" />
              Sign Off Job
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{signOffTarget?.name}</span>
              {" — "}
              {signOffTarget?.plot.plotNumber ? `Plot ${signOffTarget.plot.plotNumber}` : signOffTarget?.plot.name}
              {signOffTarget?.assignedTo && ` · ${signOffTarget.assignedTo.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Sign-off Notes (optional)</Label>
              <Textarea
                placeholder="Describe work completed, any issues, or handover notes..."
                value={signOffNotes}
                onChange={(e) => setSignOffNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Photos (optional)</Label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50">
                <Camera className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Tap to take a photo or choose from gallery</p>
                  <p className="text-[11px] text-muted-foreground/70">Tagged as &ldquo;after&rdquo; on the job</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleSignOffPhotosChange(e.target.files)}
                />
              </label>
              {signOffPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {signOffPreviews.map((url, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-16 rounded object-cover ring-1 ring-slate-200" />
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                        onClick={() => removeSignOffPhoto(i)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" disabled={signOffSubmitting} />}>Cancel</DialogClose>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={signOffSubmitting}
              onClick={handleSignOffSubmit}
            >
              {signOffSubmitting
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <CheckCircle2 className="mr-1.5 size-3.5" />}
              Sign Off Job
            </Button>
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

      {/* Post-Completion Decision Dialog */}
      <PostCompletionDialog
        open={!!completionContext}
        completedJobName={completionContext?.completedJobName ?? ""}
        daysDeviation={completionContext?.daysDeviation ?? 0}
        nextJob={completionContext?.nextJob ?? null}
        plotId={completionContext?.plotId ?? ""}
        onClose={() => setCompletionContext(null)}
        onDecisionMade={() => setRefreshKey((k) => k + 1)}
      />

      {/* Snag Resolve Dialog (P5) */}
      <Dialog
        open={!!snagResolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            snagResolvePreviews.forEach((url) => URL.revokeObjectURL(url));
            setSnagResolveTarget(null);
            setSnagResolvePhotos([]);
            setSnagResolvePreviews([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              Resolve Snag
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground line-clamp-2">{snagResolveTarget?.description}</span>
              {" — "}
              {snagResolveTarget?.plot.plotNumber ? `Plot ${snagResolveTarget.plot.plotNumber}` : snagResolveTarget?.plot.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Resolution Photo (optional)</Label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50">
                <Camera className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Tap to take a photo or choose from gallery</p>
                  <p className="text-[11px] text-muted-foreground/70">Tagged as &ldquo;after&rdquo; on the snag</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleSnagResolvePhotosChange(e.target.files)}
                />
              </label>
              {snagResolvePreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {snagResolvePreviews.map((url, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-16 rounded object-cover ring-1 ring-slate-200" />
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                        onClick={() => removeSnagResolvePhoto(i)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" disabled={snagResolveSubmitting} />}>Cancel</DialogClose>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={snagResolveSubmitting}
              onClick={handleSnagResolveSubmit}
            >
              {snagResolveSubmitting
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <CheckCircle2 className="mr-1.5 size-3.5" />}
              Resolve Snag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor quick-assign dialog */}
      <Dialog open={!!contractorAssignTarget} onOpenChange={(open) => { if (!open) { setContractorAssignTarget(null); setSelectedContractorId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Assign Contractor</DialogTitle>
            <DialogDescription className="text-xs">
              {contractorAssignTarget?.jobName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {availableContractors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contractors found. Add contractors in the Contacts page first.</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="contractor-select" className="text-xs">Contractor</Label>
                <select
                  id="contractor-select"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedContractorId}
                  onChange={(e) => setSelectedContractorId(e.target.value)}
                >
                  <option value="">Select a contractor...</option>
                  {availableContractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={!selectedContractorId || assigningContractor}
              onClick={handleContractorAssign}
            >
              {assigningContractor ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <UserPlus className="mr-1.5 size-3.5" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
