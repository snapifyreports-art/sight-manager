"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { differenceInWorkingDays } from "@/lib/working-days";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import { buildOrderMailto } from "@/lib/order-email";
import { useJobAction } from "@/hooks/useJobAction";
import { useDelayJob } from "@/hooks/useDelayJob";
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
  Truck,
  Phone,
  HardHat,
  CheckCircle,
  Bell,
  ListTodo,
  GitBranch,
  StickyNote,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SnagDialog } from "@/components/snags/SnagDialog";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
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
  site: { name: string; address: string | null; postcode: string | null };
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
    inactivePlotCount: number;
    pendingSignOffCount?: number;
  };
  inactivePlots?: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    houseType: string | null;
    inactivityType: string;
    label: string;
    nextJob: { id: string; name: string; startDate: string | null; endDate: string | null; contractorName: string | null; contractorPhone: string | null; contractorEmail: string | null; assignedToName: string | null } | null;
    hasContractor?: boolean;
    ordersPending?: number;
    ordersOrdered?: number;
    ordersTotal?: number;
  }>;
  // Legacy — kept for backward compat
  awaitingRestartPlots?: Array<{
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
  delayedJobs?: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    originalStartDate: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
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
    plotId?: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
  jobsStartingToday: Array<{
    id: string;
    name: string;
    status: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
    readiness?: {
      hasContractor: boolean;
      hasAssignee: boolean;
      predecessorComplete: boolean;
      ordersPending: number;
      ordersOrdered: number;
      ordersDelivered: number;
      ordersTotal: number;
      pendingOrdersList?: Array<{ id: string; description: string | null; supplierName: string; supplierEmail: string | null }>;
    };
  }>;
  jobsDueToday: Array<{
    id: string;
    name: string;
    status: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    orders?: Array<{ id: string; status: string }>;
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
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null; accountNumber: string | null };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
    orderItems: Array<{ id: string; name: string; quantity: number; unit: string; unitCost: number; totalCost: number }>;
  }>;
  upcomingOrders: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null; accountNumber: string | null };
    job: { id: string; name: string; plot: { plotNumber: string | null; name: string } };
    orderItems: Array<{ id: string; name: string; quantity: number; unit: string; unitCost: number; totalCost: number }>;
  }>;
  upcomingDeliveries: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string };
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
  pendingSignOffs?: Array<{
    id: string;
    name: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
  }>;
  weather: {
    today: { date: string; category: string; tempMax: number; tempMin: number };
    forecast: Array<{ date: string; category: string; tempMax: number; tempMin: number }>;
  } | null;
  awaitingSignOff?: Array<{
    id: string;
    name: string;
    status: string;
    actualEndDate: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
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

  // Centralised job action hook for late-start / early-start dialogs
  const { triggerAction: triggerJobAction, runSimpleAction, dialogs: jobActionDialogs } = useJobAction(
    () => setRefreshKey((k) => k + 1)
  );

  // Centralised delay-job flow (shared across Daily Brief, Programme, Walkthrough, Tasks, Jobs)
  const { openDelayDialog, dialogs: delayDialogs } = useDelayJob(
    () => setRefreshKey((k) => k + 1)
  );

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

  // Delay dialog state — delegated to useDelayJob hook (see above).

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

  // Checklist expand state (which job + which item is expanded)
  const [checklistExpand, setChecklistExpand] = useState<{ jobId: string; item: "orders" | "contractor" | "assignee" | "predecessor" } | null>(null);

  // Needs Attention expand state
  const [expandedAttentionItem, setExpandedAttentionItem] = useState<string | null>(null);

  // Inline snag dialog state
  const [inlineSnagTarget, setInlineSnagTarget] = useState<{ jobId: string; plotId: string; contactId?: string } | null>(null);

  // Inline note dialog state
  const [noteTarget, setNoteTarget] = useState<{ jobId: string; jobName: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Inline photo upload state
  const [photoTarget, setPhotoTarget] = useState<{ jobId: string; jobName: string } | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };


  // Sign-off dialog state
  const [signOffTarget, setSignOffTarget] = useState<{
    id: string;
    name: string;
    status?: string;
    plot?: { plotNumber: string | null; name: string };
    assignedTo?: { name: string } | null;
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
    signOffNotes?: string;
  } | null>(null);

  // Contractor quick-assign state
  const [contractorAssignTarget, setContractorAssignTarget] = useState<{ jobId: string; jobName: string } | null>(null);
  const [availableContractors, setAvailableContractors] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [assigningUser, setAssigningUser] = useState(false);
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

  // Auto-refresh when tab regains focus (real-time sync across views)
  useRefreshOnFocus(fetchData);

  // Open sections that have content; empty ones stay collapsed; recent-activity always closed
  useEffect(() => {
    if (!data) return;
    const open = new Set<string>();
    // Today's Jobs always expanded, In Progress if it has items
    open.add("todays-jobs");
    if (data.activeJobs.length > 0) open.add("in-progress");
    setOpenSections(open);
  }, [data]);

  const prevDay = () => setDate((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setDate((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setDate(getCurrentDate());

  // Quick job action handler (UX #1) — uses runSimpleAction for non-start paths.
  // Preserves post-complete cascade-prompt logic (needs the response body).
  const handleJobAction = async (jobId: string, action: "start" | "complete") => {
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await runSimpleAction(jobId, action);
      if (res.ok) {
        setRefreshKey((k) => k + 1);
        // After completing, check if dates differ and prompt cascade
        const result = res.data as { endDate?: string; actualEndDate?: string; name?: string } | undefined;
        if (action === "complete" && result?.endDate && result?.actualEndDate) {
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
      }
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

  // Inline note handler — uses runSimpleAction (fixes the `note` vs `notes` bug
  // that silently dropped the note content).
  const handleAddNote = async () => {
    if (!noteTarget || !noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      const res = await runSimpleAction(noteTarget.jobId, "note", { notes: noteText.trim() });
      if (res.ok) {
        setNoteTarget(null);
        setNoteText("");
      }
    } finally {
      setNoteSubmitting(false);
    }
  };

  // Inline photo handler
  const handleUploadPhotos = async () => {
    if (!photoTarget || photoFiles.length === 0) return;
    setPhotoSubmitting(true);
    try {
      const fd = new FormData();
      photoFiles.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/jobs/${photoTarget.jobId}/photos`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        setPhotoTarget(null);
        setPhotoFiles([]);
        showToast(`${photoFiles.length} photo${photoFiles.length !== 1 ? "s" : ""} uploaded`, "success");
        setRefreshKey((k) => k + 1);
      } else {
        showToast("Failed to upload photos");
      }
    } catch {
      showToast("Network error");
    } finally {
      setPhotoSubmitting(false);
    }
  };

  // Reopen job handler — set back to IN_PROGRESS, then open delay dialog for programme impact
  const handleReopenJob = async (jobId: string, jobName?: string) => {
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
        showToast("Job reopened — set delay to update programme", "success");
        // Open delay dialog so user can set the programme impact
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setExtendTarget({ id: jobId, name: jobName || jobData.name, endDate: jobData.endDate || null });
          setExtendDays(1);
          setExtendPreview(null);
        }
      } else {
        showToast("Failed to reopen job");
      }
    } catch {
      showToast("Network error");
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  // Assignee quick-assign
  const handleAssigneeOpen = async (jobId: string) => {
    setChecklistExpand({ jobId, item: "assignee" });
    setSelectedAssigneeId("");
    try {
      const res = await fetch("/api/users");
      if (res.ok) setAvailableUsers(await res.json());
    } catch { /* silently fail */ }
  };

  const handleAssigneeConfirm = async (jobId: string) => {
    if (!selectedAssigneeId) return;
    setAssigningUser(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: selectedAssigneeId }),
      });
      if (res.ok) {
        setChecklistExpand(null);
        setRefreshKey((k) => k + 1);
      }
    } finally {
      setAssigningUser(false);
    }
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

  // Delay handler delegated to useDelayJob hook — see hook for implementation.

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

  const handleGroupOrderAction = (ids: string[], status: string) => {
    ids.forEach((id) => handleOrderAction(id, status));
  };

  const groupedOrdersToPlace = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, typeof data.ordersToPlace>();
    for (const o of data.ordersToPlace) {
      const key = `${o.supplier.id}__${o.job.name}`;
      const existing = map.get(key) ?? [];
      existing.push(o);
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [data]);

  const groupedUpcomingOrders = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, typeof data.upcomingOrders>();
    for (const o of data.upcomingOrders) {
      const key = `${o.supplier.id}__${o.job.name}`;
      const existing = map.get(key) ?? [];
      existing.push(o);
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [data]);

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
        const photoRes = await fetch(`/api/jobs/${signOffTarget.id}/photos`, { method: "POST", body: fd });
        if (!photoRes.ok) {
          showToast("Photos failed to upload — sign-off cancelled", "error");
          setSignOffSubmitting(false);
          return;
        }
      }
      // If job is already COMPLETED, just sign off. Otherwise complete + signoff.
      const isAlreadyCompleted = signOffTarget.status === "COMPLETED";
      if (!isAlreadyCompleted) {
        // Silent: the signoff action will toast; a duplicate "Job marked complete"
        // would confuse the user in a sign-off flow.
        await runSimpleAction(signOffTarget.id, "complete", { silent: true });
      }
      const res = await runSimpleAction(signOffTarget.id, "signoff", {
        signOffNotes: signOffNotes.trim() || undefined,
      });
      if (res.ok) {
        const result = res.data as {
          _completionContext?: {
            daysDeviation: number;
            nextJob: { id: string; name: string; contractorName: string | null; assignedToName: string | null } | null;
            plotId: string;
          };
        } | undefined;
        signOffPreviews.forEach((url) => URL.revokeObjectURL(url));
        setSignOffTarget(null);
        setRefreshKey((k) => k + 1);
        // Show post-completion decision dialog
        if (result?._completionContext) {
          setCompletionContext({
            completedJobName: signOffTarget.name,
            signOffNotes: signOffNotes.trim() || undefined,
            ...result._completionContext,
          });
        }
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
    <div key={j.id} className="rounded border p-2 text-sm">
      <div className="flex items-center gap-2">
        {bulkMode && (
          <input
            type="checkbox"
            checked={selectedJobIds.has(j.id)}
            onChange={() => toggleJobSelection(j.id)}
            className="size-3.5 shrink-0 accent-blue-600"
          />
        )}
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
      {showAction && !bulkMode && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
          <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
          {pendingActions.has(j.id) ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : j.status === "COMPLETED" ? (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600">
              <Check className="size-3" /> Done
            </span>
          ) : j.status === "IN_PROGRESS" ? (
            <>
              <Button variant="outline" size="sm" className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); handleJobAction(j.id, "complete"); }}>
                <CheckCircle2 className="size-2.5" /> Complete
              </Button>
              <Button variant="outline" size="sm" className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); handleExtendOpen(j.id); }}>
                <Clock className="size-2.5" /> Extend
              </Button>
            </>
          ) : j.status === "NOT_STARTED" ? (
            <>
              <Button variant="outline" size="sm" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); handleJobAction(j.id, "start"); }}>
                <Play className="size-2.5" /> Start
              </Button>
              <Button variant="outline" size="sm" className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); handleExtendOpen(j.id); }}>
                <Clock className="size-2.5" /> Extend
              </Button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Date + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold sm:text-lg">
          {format(date, "EEEE, d MMMM yyyy")}
        </p>
        <div className="flex items-center gap-2">
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

      {/* Summary stats — grouped by section */}
      {(() => {
        const pill = (label: string, value: number | string, anchor: string | null, activeColor: string) => {
          const num = typeof value === "number" ? value : parseInt(value) || 0;
          if (num === 0 && label !== "Progress") return null;
          const inner = (
            <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm">
              <span className={cn("text-sm font-bold leading-none", activeColor)}>{value}</span>
              <span className="leading-tight text-foreground">{label}</span>
            </div>
          );
          return anchor ? (
            <a key={label} href={`#${anchor}`} className="no-underline hover:opacity-80 transition-opacity">{inner}</a>
          ) : (
            <div key={label}>{inner}</div>
          );
        };
        return (
          <div className="space-y-2">
            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <span className="text-lg font-bold leading-none text-foreground">{s.progressPercent}%</span>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Progress</p>
                  <p className="text-[10px] text-muted-foreground">{s.completedJobs}/{s.totalJobs} jobs</p>
                </div>
              </div>
            </div>

            {/* Jobs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Jobs</span>
              {pill("Starting", data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED").length, "section-starting-today", "text-green-600")}
              {pill("Finishing", data.jobsDueToday.length, "section-starting-today", "text-emerald-600")}
              {pill("Late", s.lateStartCount, "section-late-starts", "text-red-600")}
              {pill("Blocked", s.blockedCount, "section-blocked", "text-slate-500")}
              {pill("Overdue", s.overdueJobCount, "section-overdue", "text-red-600")}
              {pill("Sign Off", data.awaitingSignOff?.length || 0, "section-awaiting-signoff", "text-amber-600")}
            </div>

            {/* Materials */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Materials</span>
              {pill("Deliveries", data.deliveriesToday.length, "section-deliveries", "text-blue-600")}
              {pill("To Order", data.ordersToPlace.length, "section-orders", "text-violet-600")}
              {pill("Awaiting", data.upcomingDeliveries?.length || 0, "section-upcoming-deliveries", "text-blue-600")}
            </div>

            {/* Issues */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Issues</span>
              {pill("Snags", s.openSnagCount, "section-snags", "text-orange-600")}
              {pill("Attention", data.needsAttention?.length || 0, "section-needs-attention", "text-amber-600")}
              {pill("Contractors", (data.inactivePlots ?? []).filter((p) => p.inactivityType === "awaiting_contractor").length, "section-contractor-confirmations", "text-amber-600")}
              {pill("Inactive", data.inactivePlots?.length || 0, "section-inactive-plots", "text-orange-600")}
            </div>
          </div>
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
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap">
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
                    <div className="hidden h-14 border-l sm:block" />
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
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <CloudRain className="size-4 shrink-0" />
                    <span className="font-medium">Rain today — do you want to mark this as a rained off day?</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full shrink-0 bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
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

      {/* ═══════════════ ALERTS ═══════════════ */}
      {(() => {
        const todayJobCount = data.jobsStartingToday.length + data.jobsDueToday.length + data.lateStartJobs.length + data.overdueJobs.length + (data.awaitingSignOff?.length || 0);
        const snagCount = data.summary.openSnagCount;
        const inactiveCount = data.inactivePlots?.length || 0;
        const contractorPending = (data.inactivePlots ?? []).filter(p => p.inactivityType === "awaiting_contractor").length;
        const attentionCount = data.needsAttention?.length || 0;

        const lines: Array<{ href: string; color: string; icon: React.ReactNode; text: string }> = [];

        // Summary counts
        const startingCount = data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED").length;
        const recalcJobCount = startingCount + data.jobsDueToday.length + data.lateStartJobs.length + data.overdueJobs.length + (data.awaitingSignOff?.length || 0);
        if (recalcJobCount > 0) lines.push({ href: "#section-starting-today", color: "text-blue-700", icon: <Briefcase className="size-3" />, text: `${recalcJobCount} job${recalcJobCount !== 1 ? "s" : ""} today — ${startingCount} starting, ${data.jobsDueToday.length} finishing${data.lateStartJobs.length > 0 ? `, ${data.lateStartJobs.length} late` : ""}${data.overdueJobs.length > 0 ? `, ${data.overdueJobs.length} overdue` : ""}${(data.awaitingSignOff?.length || 0) > 0 ? `, ${data.awaitingSignOff!.length} sign off` : ""}` });
        if (snagCount > 0) lines.push({ href: "#section-snags", color: "text-orange-700", icon: <Bug className="size-3" />, text: `${snagCount} open snag${snagCount !== 1 ? "s" : ""}` });
        if (inactiveCount > 0) lines.push({ href: "#section-inactive-plots", color: "text-amber-700", icon: <PauseCircle className="size-3" />, text: `${inactiveCount} inactive plot${inactiveCount !== 1 ? "s" : ""} need decisions` });

        // Issue alerts
        if (data.overdueDeliveries.length > 0) lines.push({ href: "#section-overdue", color: "text-red-700", icon: <Package className="size-3" />, text: `${data.overdueDeliveries.length} overdue deliver${data.overdueDeliveries.length !== 1 ? "ies" : "y"}` });
        if (contractorPending > 0) lines.push({ href: "#section-contractor-confirmations", color: "text-amber-700", icon: <HardHat className="size-3" />, text: `${contractorPending} contractor confirmation${contractorPending !== 1 ? "s" : ""} pending` });
        if (attentionCount > 0) lines.push({ href: "#section-needs-attention", color: "text-amber-700", icon: <AlertTriangle className="size-3" />, text: `${attentionCount} item${attentionCount !== 1 ? "s" : ""} need attention (missing info)` });

        if (lines.length === 0) return null;
        return (
          <>
            <div className="mt-6 flex items-center gap-2 border-b-2 border-blue-200 pb-1">
              <Bell className="size-4 text-blue-600" />
              <h2 className="text-xs font-bold text-blue-900 uppercase tracking-widest">Alerts</h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {lines.length}
              </span>
            </div>
            <div className="space-y-1.5 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
              {lines.map((line, i) => (
                <a key={i} href={line.href} className={`flex items-center gap-2 text-xs ${line.color} no-underline hover:underline`}>
                  {line.icon} {line.text}
                </a>
              ))}
            </div>
          </>
        );
      })()}

      {/* ═══════════════ GROUP 2: ACTIONS TODAY ═══════════════ */}
      {(() => {
        // Count sections with content, not individual items
        let sectionCount = 0;
        if (data.jobsStartingToday.length > 0 || data.jobsDueToday.length > 0 || data.lateStartJobs.length > 0 || data.overdueJobs.length > 0 || (data.awaitingSignOff?.length || 0) > 0) sectionCount++;
        if (data.deliveriesToday.length > 0 || data.ordersToPlace.length > 0) sectionCount++;
        if (data.activeJobs.length > 0) sectionCount++;
        return (
          <div className="mt-6 flex items-center gap-2 border-b-2 border-green-200 pb-1">
            <ListTodo className="size-4 text-green-600" />
            <h2 className="text-xs font-bold text-green-900 uppercase tracking-widest">Actions Today</h2>
            {sectionCount > 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                {sectionCount} section{sectionCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })()}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Today's Jobs — unified start/finish */}
        <Card id="section-starting-today" className="md:col-span-2">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("todays-jobs")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="size-4 text-green-600" />
              Today&apos;s Jobs ({data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED").length + data.jobsDueToday.length + data.lateStartJobs.length + data.overdueJobs.length + (data.awaitingSignOff?.length || 0)})
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
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("todays-jobs") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("todays-jobs") && (
            <CardContent>
              {data.jobsStartingToday.length === 0 && data.jobsDueToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs scheduled today</p>
              ) : (
                <div className="space-y-2">
                  {/* Starting — only show NOT_STARTED jobs */}
                  {(() => {
                    const startingJobs = data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED");
                    return startingJobs.length > 0 ? (
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-green-700">
                        <Play className="size-3" /> Starting ({startingJobs.length})
                      </p>
                    ) : null;
                  })()}
                  {data.jobsStartingToday.filter((j) => j.status === "NOT_STARTED").map((j) => {
                    const r = j.readiness;
                    return (
                      <div key={j.id} className="rounded border p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                          <Badge variant="outline" className="shrink-0 border-green-200 text-[10px] text-green-700">Start</Badge>
                          {j.status === "IN_PROGRESS" && <Badge className="shrink-0 text-[10px]">IN PROGRESS</Badge>}
                          {j.status === "COMPLETED" && <Badge variant="secondary" className="shrink-0 text-[10px]">COMPLETED</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <Link href={`/sites/${siteId}/plots/${j.plotId}`} className="hover:underline hover:text-blue-600">{j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}</Link>
                          {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
                          {j.contractors?.[0]?.contact && <span className="hidden sm:inline"> · {j.contractors[0].contact.company || j.contractors[0].contact.name}</span>}
                        </p>
                        {/* Readiness checklist — expandable inline */}
                        {r && j.status === "NOT_STARTED" && (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                              {r.predecessorComplete ? (
                                <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Predecessor</span>
                              ) : (
                                <button onClick={() => setChecklistExpand(checklistExpand?.jobId === j.id && checklistExpand.item === "predecessor" ? null : { jobId: j.id, item: "predecessor" })} className="text-red-600 underline hover:text-red-800">
                                  <X className="inline size-3 mr-0.5" />Predecessor
                                </button>
                              )}
                              {r.hasContractor ? (
                                <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Contractor</span>
                              ) : (
                                <button onClick={() => { setChecklistExpand({ jobId: j.id, item: "contractor" }); handleContractorAssignOpen(j.id, j.name); }} className="text-red-600 underline hover:text-red-800">
                                  <X className="inline size-3 mr-0.5" />Contractor
                                </button>
                              )}
                              {r.hasAssignee ? (
                                <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Assignee</span>
                              ) : (
                                <button onClick={() => handleAssigneeOpen(j.id)} className="text-red-600 underline hover:text-red-800">
                                  <X className="inline size-3 mr-0.5" />Assignee
                                </button>
                              )}
                              {r.ordersPending === 0 ? (
                                <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Sent</span>
                              ) : (
                                <button onClick={() => setChecklistExpand(checklistExpand?.jobId === j.id && checklistExpand.item === "orders" ? null : { jobId: j.id, item: "orders" })} className="text-red-600 underline hover:text-red-800">
                                  <X className="inline size-3 mr-0.5" />{r.ordersPending} not sent
                                </button>
                              )}
                              {r.ordersOrdered === 0 && r.ordersPending === 0 ? (
                                <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Materials</span>
                              ) : (
                                <span className="text-amber-600"><Clock className="inline size-3 mr-0.5" />{r.ordersOrdered > 0 ? `${r.ordersOrdered} awaiting` : "Materials"}</span>
                              )}
                            </div>

                            {/* Expanded inline panels */}
                            {checklistExpand?.jobId === j.id && checklistExpand.item === "orders" && r.pendingOrdersList && (
                              <div className="rounded border border-red-200 bg-red-50/50 p-2 space-y-1.5">
                                <p className="text-[10px] font-semibold text-red-700">Pending Orders</p>
                                {r.pendingOrdersList.map((o) => (
                                  <div key={o.id} className="flex items-center justify-between text-[10px]">
                                    <div>
                                      <span className="font-medium">{o.supplierName}</span>
                                      {o.description && <span className="text-muted-foreground"> — {o.description}</span>}
                                    </div>
                                    <div className="flex gap-1">
                                      {o.supplierEmail && (
                                        <a href={`mailto:${o.supplierEmail}?subject=${encodeURIComponent(`Order — ${o.description || j.name}`)}`}
                                          onClick={() => handleOrderAction(o.id, "ORDERED")}
                                          className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-violet-700 hover:bg-violet-50">
                                          <Mail className="inline size-2.5 mr-0.5" />Send
                                        </a>
                                      )}
                                      <button onClick={() => handleOrderAction(o.id, "ORDERED")}
                                        className="rounded border border-blue-200 bg-white px-1.5 py-0.5 text-blue-700 hover:bg-blue-50">
                                        <Package className="inline size-2.5 mr-0.5" />Mark Sent
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {checklistExpand?.jobId === j.id && checklistExpand.item === "contractor" && (
                              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                                <p className="text-[10px] font-semibold text-red-700 mb-1">Assign Contractor</p>
                                <div className="flex gap-1">
                                  <select value={selectedContractorId} onChange={(e) => setSelectedContractorId(e.target.value)}
                                    className="flex-1 rounded border px-2 py-1 text-[10px]">
                                    <option value="">Select...</option>
                                    {availableContractors.map((c) => (
                                      <option key={c.id} value={c.id}>{c.company || c.name}</option>
                                    ))}
                                  </select>
                                  <Button size="sm" className="h-6 px-2 text-[10px]" disabled={!selectedContractorId || assigningContractor} onClick={handleContractorAssign}>
                                    {assigningContractor ? <Loader2 className="size-3 animate-spin" /> : "Assign"}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {checklistExpand?.jobId === j.id && checklistExpand.item === "assignee" && (
                              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                                <p className="text-[10px] font-semibold text-red-700 mb-1">Assign Team Member</p>
                                <div className="flex gap-1">
                                  <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)}
                                    className="flex-1 rounded border px-2 py-1 text-[10px]">
                                    <option value="">Select...</option>
                                    {availableUsers.map((u) => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </select>
                                  <Button size="sm" className="h-6 px-2 text-[10px]" disabled={!selectedAssigneeId || assigningUser} onClick={() => handleAssigneeConfirm(j.id)}>
                                    {assigningUser ? <Loader2 className="size-3 animate-spin" /> : "Assign"}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {checklistExpand?.jobId === j.id && checklistExpand.item === "predecessor" && (
                              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                                <p className="text-[10px] font-semibold text-red-700 mb-1">Blocked by predecessor job</p>
                                <p className="text-[10px] text-muted-foreground">A previous job on this plot hasn&apos;t been completed yet.</p>
                                <Link href={`/jobs/${j.id}`} className="mt-1 inline-block text-[10px] text-blue-600 underline">View job details →</Link>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                          <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                          {pendingActions.has(j.id) ? (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          ) : j.status === "NOT_STARTED" ? (
                            <>
                              <Button variant="outline" size="sm" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50" onClick={() => triggerJobAction({ id: j.id, name: j.name, status: "NOT_STARTED", startDate: null, endDate: null }, "start")}>
                                <Play className="size-2.5" /> Start
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50" onClick={() => handleExtendOpen(j.id)}>
                                <Clock className="size-2.5" /> Extend
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50" onClick={() => {
                                // In this branch the job row doesn't carry startDate/endDate
                                // (it's the simplified "jobs starting today" view); the delay
                                // endpoint fetches them server-side from the job record.
                                openDelayDialog({ id: j.id, name: j.name, startDate: null, endDate: null });
                              }}>
                                <CalendarClock className="size-2.5" /> Delay
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setNoteTarget({ jobId: j.id, jobName: j.name })}>
                                <StickyNote className="size-2.5" /> Note
                              </Button>
                            </>
                          ) : (
                            <JobActionButton
                              jobId={j.id}
                              status={j.status}
                              pending={false}
                              onAction={handleJobAction}
                              onExtend={() => handleExtendOpen(j.id)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Finishing */}
                  {data.jobsDueToday.length > 0 && (
                    <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700", data.jobsStartingToday.length > 0 && "mt-3 border-t pt-3")}>
                      <FileCheck className="size-3" /> Finishing ({data.jobsDueToday.length})
                    </p>
                  )}
                  {data.jobsDueToday.map((j) => (
                    <div key={j.id} className="rounded border p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                        <Badge variant="outline" className="shrink-0 border-emerald-200 text-[10px] text-emerald-700">Finish</Badge>
                        {j.status !== "NOT_STARTED" && j.status !== "COMPLETED" && (
                          <Badge className="shrink-0 text-[10px]">{j.status.replace(/_/g, " ")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/sites/${siteId}/plots/${j.plotId}`} className="hover:underline hover:text-blue-600">{j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}</Link>
                        {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                        {j.status === "COMPLETED" ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                            <Check className="size-3" /> Signed Off
                          </span>
                        ) : pendingActions.has(j.id) ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50" onClick={() => handleExtendOpen(j.id)}>
                              <Clock className="size-2.5" /> Extend
                            </Button>
                            <Button size="sm" className="h-6 gap-1 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700" onClick={() => handleJobAction(j.id, "complete")}>
                              <CheckCircle2 className="size-2.5" /> Complete
                            </Button>
                            <Button size="sm" className="h-6 gap-1 bg-emerald-700 px-2 text-[10px] text-white hover:bg-emerald-800" onClick={() => handleOpenSignOff(j)}>
                              <FileCheck className="size-2.5" /> Sign Off
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setInlineSnagTarget({ jobId: j.id, plotId: j.plotId, contactId: (j as { contractors?: Array<{ contactId: string }> }).contractors?.[0]?.contactId })}>
                              <AlertTriangle className="size-2.5" /> Snag
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setNoteTarget({ jobId: j.id, jobName: j.name })}>
                              <StickyNote className="size-2.5" /> Note
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setPhotoTarget({ jobId: j.id, jobName: j.name })}>
                              <Camera className="size-2.5" /> Photos
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* ── Late Starts ── */}
                  {data.lateStartJobs.length > 0 && (
                    <p id="section-late-starts" className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-700", (data.jobsStartingToday.length > 0 || data.jobsDueToday.length > 0) && "mt-3 border-t pt-3")}>
                      <Clock className="size-3" /> Late Starts ({data.lateStartJobs.length})
                    </p>
                  )}
                  {data.lateStartJobs.map((j) => (
                    <div key={`late-${j.id}`} className="rounded border border-amber-100 bg-amber-50/50 p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                        <Badge variant="outline" className="shrink-0 border-red-200 text-[10px] text-red-700">Late</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {j.plotId ? <Link href={`/sites/${siteId}/plots/${j.plotId}`} className="hover:underline hover:text-blue-600">{j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}</Link> : (j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name)}
                        {j.assignedTo && <span> · {j.assignedTo.name}</span>}
                        {j.startDate && <span className="text-amber-700"> · Due {format(new Date(j.startDate), "dd MMM")}</span>}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 border-t border-amber-200 pt-1.5">
                        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50" disabled={pendingActions.has(j.id)} onClick={() => triggerJobAction({ id: j.id, name: j.name, status: "NOT_STARTED", startDate: j.startDate, endDate: j.endDate ?? null }, "start")}>
                          <Play className="size-2.5" /> Start
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50" onClick={() => {
                          // Pre-fill with the working-day gap between the original planned
                          // start and today, so the user just has to confirm the common case.
                          const planned = j.startDate ? new Date(j.startDate) : date;
                          const wd = Math.abs(differenceInWorkingDays(date, planned));
                          openDelayDialog(
                            { id: j.id, name: j.name, startDate: j.startDate ?? null, endDate: j.endDate ?? null },
                            Math.max(1, wd)
                          );
                        }}>
                          <CalendarClock className="size-2.5" /> Delay
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* ── Blocked ── */}
                  {data.blockedJobs && data.blockedJobs.length > 0 && (
                    <>
                      <p id="section-blocked" className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <Lock className="size-3" /> Blocked ({data.blockedJobs.length})
                      </p>
                      {data.blockedJobs.map((j) => (
                        <div key={`blocked-${j.id}`} className="rounded border border-slate-200 bg-slate-50/50 p-2 text-sm opacity-70">
                            <div className="flex items-center gap-2">
                              <Link href={`/jobs/${j.id}`} className="truncate font-medium text-slate-600 hover:underline">{j.name}</Link>
                              <Badge variant="outline" className="shrink-0 border-slate-300 text-[10px] text-slate-500">Blocked</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                              {j.assignedTo && <span> · {j.assignedTo.name}</span>}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                              <Lock className="size-3" /> Blocked by: {j.blockedBy}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                              <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                              <Link href={`/jobs/${j.id}`} className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] text-slate-600 hover:bg-slate-100">
                                <Briefcase className="size-2.5" /> View Job
                              </Link>
                            </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* ── Overdue ── */}
                  {(data.overdueJobs.length > 0 || data.overdueDeliveries.length > 0) && (
                    <>
                      <p id="section-overdue" className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        <AlertTriangle className="size-3" /> Overdue ({data.overdueJobs.length} job{data.overdueJobs.length !== 1 ? "s" : ""}{data.overdueDeliveries.length > 0 ? `, ${data.overdueDeliveries.length} deliver${data.overdueDeliveries.length !== 1 ? "ies" : "y"}` : ""})
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
                      </p>
                      {data.overdueJobs.slice(0, 10).map((j) => renderJobRow(j))}
                      {data.overdueJobs.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          +{data.overdueJobs.length - 10} more overdue jobs
                        </p>
                      )}
                      {data.overdueDeliveries.map((d) => (
                        <div key={`od-${d.id}`} className="flex items-start justify-between gap-2 rounded border border-red-100 bg-red-50/40 p-2 text-sm">
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

                  {/* ── Awaiting Sign Off ── */}
                  {(data.awaitingSignOff?.length || 0) > 0 && (
                    <>
                      <p id="section-awaiting-signoff" className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        <FileCheck className="size-3" /> Awaiting Sign Off ({data.awaitingSignOff!.length})
                      </p>
                      {data.awaitingSignOff!.map((j) => {
                        const daysSince = j.actualEndDate ? differenceInCalendarDays(date, new Date(j.actualEndDate)) : 0;
                        const plotLbl = j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name;
                        const contractor = j.contractors?.[0]?.contact;
                        return (
                          <div key={`signoff-${j.id}`} className="rounded border border-amber-100 bg-amber-50 p-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Link href={`/jobs/${j.id}`} className="font-medium text-foreground hover:underline">{j.name}</Link>
                              <Badge variant="outline" className="shrink-0 border-amber-200 text-[10px] text-amber-700">Sign Off</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <Link href={`/sites/${siteId}/plots/${j.plotId}`} className="hover:underline hover:text-blue-600">{plotLbl}</Link>
                              {contractor && ` · ${contractor.company || contractor.name}`}
                              {daysSince > 0 && ` · Completed ${daysSince} day${daysSince !== 1 ? "s" : ""} ago`}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-amber-200 pt-1.5">
                              <span className="w-full text-[10px] font-medium text-muted-foreground sm:mr-auto sm:w-auto">Actions</span>
                              <Button size="sm" variant="outline" className="h-6 gap-1 border-amber-300 px-2 text-[10px] text-amber-700 hover:bg-amber-100"
                                onClick={() => setSignOffTarget({ id: j.id, name: j.name, status: "COMPLETED", plot: j.plot })}>
                                <FileCheck className="size-2.5" /> Sign Off
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setInlineSnagTarget({ jobId: j.id, plotId: j.plotId, contactId: (j.contractors as Array<{ contactId?: string }>)?.[0]?.contactId })}>
                                <AlertTriangle className="size-2.5" /> Snag
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setNoteTarget({ jobId: j.id, jobName: j.name })}>
                                <StickyNote className="size-2.5" /> Note
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setPhotoTarget({ jobId: j.id, jobName: j.name })}>
                                <Camera className="size-2.5" /> Photos
                              </Button>
                              {pendingActions.has(j.id) ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <Button variant="outline" size="sm" className="h-6 gap-1 border-slate-300 px-2 text-[10px] text-slate-600 hover:bg-slate-50" onClick={() => handleReopenJob(j.id, j.name)}>
                                  <RotateCcw className="size-2.5" /> Reopen
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Materials — Deliveries + Orders to Place */}
        <Card id="section-deliveries" className="md:col-span-2">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("materials")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="size-4 text-blue-600" />
              Materials ({data.deliveriesToday.length + data.ordersToPlace.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("materials") && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {openSections.has("materials") && (
            <CardContent>
              <div className="space-y-2">
                {/* ── Deliveries Today ── */}
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  <Truck className="size-3" /> Deliveries Today ({data.deliveriesToday.length})
                </p>
                {data.deliveriesToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No deliveries expected today</p>
                ) : (
                  data.deliveriesToday.map((d) => (
                    <div key={d.id} className="rounded border p-2 text-sm">
                      <Link href={`/suppliers/${d.supplier.id}`} className="font-medium text-blue-600 hover:underline">{d.supplier.name}</Link>
                      <p className="text-xs text-muted-foreground">{d.itemsDescription || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/jobs/${d.job.id}`} className="hover:underline hover:text-blue-600">{d.job.name}</Link>
                        {" · "}{d.job.plot.plotNumber ? `Plot ${d.job.plot.plotNumber}` : d.job.plot.name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 border-t pt-1.5">
                        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                          disabled={pendingOrderActions.has(d.id)}
                          onClick={() => handleOrderAction(d.id, "DELIVERED")}
                        >
                          {pendingOrderActions.has(d.id) ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                          <span className="ml-1">Received</span>
                        </Button>
                      </div>
                    </div>
                  ))
                )}

                {/* ── Orders to Place ── */}
                <p id="section-orders" className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  <ShoppingCart className="size-3" /> Orders to Place ({data.ordersToPlace.length})
                </p>
                {data.ordersToPlace.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No orders to place</p>
                ) : (
                  groupedOrdersToPlace.map((group) => {
                    const o = group[0];
                    const groupIds = group.map((g) => g.id);
                    const anyPending = groupIds.some((id) => pendingOrderActions.has(id));
                    const mailto = o.supplier.contactEmail
                      ? buildOrderMailto(o.supplier.contactEmail, {
                          supplierName: o.supplier.name,
                          supplierContactName: o.supplier.contactName,
                          supplierAccountNumber: o.supplier.accountNumber,
                          jobName: o.job.name,
                          siteName: data.site.name,
                          siteAddress: data.site.address,
                          sitePostcode: data.site.postcode,
                          plotNumbers: group.map((g) => g.job.plot.plotNumber ? `Plot ${g.job.plot.plotNumber}` : g.job.plot.name),
                          items: (o.orderItems || []).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
                          itemsDescriptionFallback: o.itemsDescription,
                          expectedDeliveryDate: o.expectedDeliveryDate,
                          orderDate: o.dateOfOrder,
                        })
                      : null;
                    return (
                      <div key={`${o.supplier.id}__${o.job.name}`} className="rounded border p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/suppliers/${o.supplier.id}`} className="truncate font-medium text-blue-600 hover:underline">
                            {o.supplier.name}
                          </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">{o.itemsDescription || "—"}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          {o.dateOfOrder && (
                            <span>Order by <span className="font-medium text-purple-600">{format(new Date(o.dateOfOrder), "dd MMM")}</span></span>
                          )}
                          {o.expectedDeliveryDate && (
                            <span>Delivery by <span className="font-medium text-teal-600">{format(new Date(o.expectedDeliveryDate), "dd MMM")}</span></span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <Link href={`/jobs/${o.job.id}`} className="text-xs hover:underline hover:text-blue-600">{o.job.name}</Link>
                          <span className="text-xs text-muted-foreground">·</span>
                          {group.slice(0, 5).map((g) => (
                            <span key={g.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {g.job.plot.plotNumber ? `Plot ${g.job.plot.plotNumber}` : g.job.plot.name}
                            </span>
                          ))}
                          {group.length > 5 && (
                            <span className="text-[10px] text-muted-foreground">+{group.length - 5} more</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                          <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                          {anyPending ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              {mailto && (
                                <Button variant="outline" size="sm" className="h-6 border-violet-200 px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                                  onClick={() => { window.open(mailto, "_blank"); handleGroupOrderAction(groupIds, "ORDERED"); }}>
                                  <Mail className="mr-1 size-2.5" />{group.length > 1 ? `Send (${group.length})` : "Send Order"}
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-6 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                                onClick={() => handleGroupOrderAction(groupIds, "ORDERED")}>
                                <Package className="mr-1 size-2.5" />{mailto ? "Mark Sent" : "Place Order"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* In Progress jobs — separate card */}
      {data.activeJobs.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("in-progress")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-blue-600" />
              In Progress ({data.activeJobs.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("in-progress") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Active jobs across all plots</CardDescription>
          </CardHeader>
          {openSections.has("in-progress") && (
            <CardContent>
              <div className="space-y-2">
                {data.activeJobs.map((j) => (
                  <div key={j.id} className="rounded border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                      <Badge className="shrink-0 text-[10px]">IN PROGRESS</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/sites/${siteId}/plots/${(j as { plotId?: string }).plotId}`} className="hover:underline hover:text-blue-600">{j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}</Link>
                      {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
                      {(j as { contractors?: Array<{ contact: { company: string | null; name: string } }> }).contractors?.[0]?.contact && (
                        <span className="hidden sm:inline"> · {(j as { contractors?: Array<{ contact: { company: string | null; name: string } }> }).contractors![0].contact.company || (j as { contractors?: Array<{ contact: { company: string | null; name: string } }> }).contractors![0].contact.name}</span>
                      )}
                      {j.endDate && <span> · Due {format(new Date(j.endDate), "dd MMM")}</span>}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                      <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                      {pendingActions.has(j.id) ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50" onClick={() => handleJobAction(j.id, "complete")}>
                            <CheckCircle2 className="size-2.5" /> Complete
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50" onClick={() => handleExtendOpen(j.id)}>
                            <Clock className="size-2.5" /> Extend
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setInlineSnagTarget({ jobId: j.id, plotId: (j as { plotId?: string }).plotId || "", contactId: (j as { contractors?: Array<{ contactId?: string }> }).contractors?.[0]?.contactId })}>
                            <AlertTriangle className="size-2.5" /> Snag
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setNoteTarget({ jobId: j.id, jobName: j.name })}>
                            <StickyNote className="size-2.5" /> Note
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Delayed jobs — pushed forward, not yet started */}
      {(data.delayedJobs?.length || 0) > 0 && (
        <>
          <div className="mt-6 flex items-center gap-2 border-b-2 border-purple-200 pb-1">
            <CalendarClock className="size-4 text-purple-600" />
            <h2 className="text-xs font-bold text-purple-900 uppercase tracking-widest">Delayed</h2>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
              {data.delayedJobs!.length} job{data.delayedJobs!.length !== 1 ? "s" : ""} pushed
            </span>
          </div>
          <Card>
            <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("delayed")}>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="size-4 text-purple-600" />
                Delayed Jobs ({data.delayedJobs!.length})
                <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("delayed") && "rotate-180")} />
              </CardTitle>
              <CardDescription className="text-xs">Jobs that have been pushed forward — originally due earlier</CardDescription>
            </CardHeader>
            {openSections.has("delayed") && (
              <CardContent>
                <div className="space-y-2">
                  {data.delayedJobs!.map((j) => (
                    <div key={j.id} className="rounded border border-purple-100 bg-purple-50/30 p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-blue-600 hover:underline">{j.name}</Link>
                        <Badge variant="outline" className="shrink-0 border-purple-200 text-[10px] text-purple-700">Delayed</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                        {j.assignedTo && <span className="hidden sm:inline"> · {j.assignedTo.name}</span>}
                        {j.contractors?.[0]?.contact && <span className="hidden sm:inline"> · {j.contractors[0].contact.company || j.contractors[0].contact.name}</span>}
                      </p>
                      <p className="text-[10px] text-purple-600">
                        Originally {j.originalStartDate ? format(new Date(j.originalStartDate), "dd MMM") : "earlier"}
                        {j.startDate && ` → now ${format(new Date(j.startDate), "dd MMM")}`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-purple-100 pt-1.5">
                        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50" onClick={() => triggerJobAction({ id: j.id, name: j.name, status: "NOT_STARTED", startDate: j.startDate, endDate: j.endDate }, "start")}>
                          <Play className="size-2.5" /> Start Now
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-purple-200 px-2 text-[10px] text-purple-700 hover:bg-purple-50" onClick={() => {
                          openDelayDialog({ id: j.id, name: j.name, startDate: j.startDate, endDate: j.endDate });
                        }}>
                          <CalendarClock className="size-2.5" /> Delay Further
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}

      {/* ═══════════════ OTHER ACTIONS ═══════════════ */}
      <div className="mt-6 flex items-center gap-2 border-b-2 border-slate-200 pb-1">
        <ListChecks className="size-4 text-slate-600" />
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Other Actions</h2>
      </div>

      {/* Needs Attention — collapsible */}
      {data.needsAttention && data.needsAttention.length > 0 && (
        <Card id="section-needs-attention">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("needs-attention")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-500" />
              Needs Attention ({data.needsAttention.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("needs-attention") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Items with missing information — click to resolve</CardDescription>
          </CardHeader>
          {openSections.has("needs-attention") && (
            <CardContent>
              <div className="space-y-2">
                {data.needsAttention.map((item) => {
                  const itemKey = `${item.type}-${item.id}`;
                  const isExpanded = expandedAttentionItem === itemKey;
                  const TypeIcon =
                    item.type === "snag" ? Bug : item.type === "job" ? Briefcase : Package;
                  return (
                    <div key={itemKey}>
                      <button
                        type="button"
                        onClick={() => setExpandedAttentionItem(isExpanded ? null : itemKey)}
                        className="flex w-full flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-left transition-colors hover:bg-amber-50"
                      >
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="size-3.5 text-amber-600 shrink-0" />
                          <p className="text-sm font-medium text-foreground line-clamp-1">{item.title}</p>
                          <ChevronDown className={cn("ml-auto size-3.5 shrink-0 text-amber-500 transition-transform duration-200", isExpanded && "rotate-180")} />
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
                      </button>
                      {isExpanded && (
                        <div className="ml-2 mt-1 space-y-1.5 rounded-b-lg border border-t-0 border-amber-200 bg-amber-50/30 p-3">
                          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Fix Actions</p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.missing.map((m) => {
                              const mLower = m.toLowerCase();
                              if (mLower.includes("sign-off") || mLower.includes("signoff") || mLower.includes("sign off")) {
                                return (
                                  <Button key={m} variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2.5 text-[10px] text-amber-700 hover:bg-amber-100"
                                    onClick={() => setSignOffTarget({ id: item.id, name: item.title, status: "COMPLETED", plot: undefined })}>
                                    <FileCheck className="size-3" /> Add Sign-Off Notes
                                  </Button>
                                );
                              }
                              if (mLower.includes("photo")) {
                                return (
                                  <Button key={m} variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2.5 text-[10px] text-amber-700 hover:bg-amber-100"
                                    onClick={() => setPhotoTarget({ jobId: item.id, jobName: item.title })}>
                                    <Camera className="size-3" /> Upload Photos
                                  </Button>
                                );
                              }
                              if (mLower.includes("assignee") || mLower.includes("assigned")) {
                                return (
                                  <Button key={m} variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2.5 text-[10px] text-amber-700 hover:bg-amber-100"
                                    onClick={() => { setChecklistExpand({ jobId: item.id, item: "assignee" }); }}>
                                    <UserPlus className="size-3" /> Assign Team Member
                                  </Button>
                                );
                              }
                              if (mLower.includes("contractor")) {
                                return (
                                  <Button key={m} variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2.5 text-[10px] text-amber-700 hover:bg-amber-100"
                                    onClick={() => handleContractorAssignOpen(item.id, item.title)}>
                                    <HardHat className="size-3" /> Assign Contractor
                                  </Button>
                                );
                              }
                              return (
                                <Link key={m} href={item.type === "snag" ? `/sites/${siteId}?tab=snags&snagId=${item.id}` : item.type === "job" ? `/jobs/${item.id}` : `/orders`}
                                  className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 px-2.5 text-[10px] text-amber-700 hover:bg-amber-100">
                                  <AlertTriangle className="size-3" /> Fix: {m}
                                </Link>
                              );
                            })}
                            <Link href={item.type === "snag" ? `/sites/${siteId}?tab=snags&snagId=${item.id}` : item.type === "job" ? `/jobs/${item.id}` : `/orders`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[10px] text-muted-foreground hover:bg-slate-100">
                              <Briefcase className="size-3" /> Open Full View
                            </Link>
                          </div>

                          {/* Inline assignee picker */}
                          {item.type === "job" && checklistExpand?.jobId === item.id && checklistExpand.item === "assignee" && (
                            <div className="rounded border border-amber-200 bg-white p-2">
                              <p className="text-[10px] font-semibold text-amber-700 mb-1">Assign Team Member</p>
                              <div className="flex gap-1">
                                <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)}
                                  className="flex-1 rounded border px-2 py-1 text-[10px]">
                                  <option value="">Select...</option>
                                  {availableUsers.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                                </select>
                                <Button size="sm" className="h-6 px-2 text-[10px]" disabled={!selectedAssigneeId || assigningUser} onClick={() => handleAssigneeConfirm(item.id)}>
                                  {assigningUser ? <Loader2 className="size-3 animate-spin" /> : "Assign"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Open Snags — collapsible (moved from Pipeline) */}
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

      {/* Pending Sign-offs — collapsible */}
      {data.pendingSignOffs && data.pendingSignOffs.length > 0 && (
        <Card id="section-pending-signoffs" className="border-amber-200">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("pending-signoffs")}>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="size-4 text-amber-500" />
              Pending Sign-offs ({data.pendingSignOffs.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("pending-signoffs") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Jobs still open while subsequent work has started</CardDescription>
          </CardHeader>
          {openSections.has("pending-signoffs") && (
            <CardContent>
              <div className="space-y-2">
                {data.pendingSignOffs.map((j) => (
                  <a
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hover:bg-amber-100 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-amber-900">{j.name}</p>
                      <p className="text-xs text-amber-600">
                        {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Sign Off
                    </span>
                  </a>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Inactive Plots section header */}
      <div className="mt-6 flex items-center gap-2 border-b-2 border-amber-200 pb-1">
        <PauseCircle className="size-4 text-amber-600" />
        <h2 className="text-xs font-bold text-amber-900 uppercase tracking-widest">Inactive Plots</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{(data.inactivePlots?.length || 0)} plots need decisions</span>
      </div>

      {/* Awaiting Contractor Confirmation */}
      {(data.inactivePlots ?? []).filter((p) => p.inactivityType === "awaiting_contractor").length > 0 && (
        <Card id="section-contractor-confirmations" className="border-orange-200 bg-orange-50/40">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("contractor-confirmations")}>
            <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
              <HardHat className="size-4" />
              Awaiting Contractor Confirmation ({(data.inactivePlots ?? []).filter((p) => p.inactivityType === "awaiting_contractor").length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("contractor-confirmations") && "rotate-180")} />
            </CardTitle>
            <p className="text-xs text-orange-600">Contractor needs to confirm availability before work can begin</p>
          </CardHeader>
          {openSections.has("contractor-confirmations") && (
            <CardContent className="space-y-2 pt-0">
              {(data.inactivePlots ?? []).filter((p) => p.inactivityType === "awaiting_contractor").map((p) => (
                <div key={p.id} className="rounded-xl border border-orange-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                        {p.houseType && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({p.houseType})</span>}
                      </p>
                      <p className="text-xs text-orange-700 mt-0.5">{p.nextJob?.name || "Next job"}</p>
                      {p.nextJob?.contractorName && (
                        <p className="text-xs font-medium mt-1">{p.nextJob.contractorName}</p>
                      )}
                    </div>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700">Awaiting</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.nextJob?.contractorPhone && (
                      <a href={`tel:${p.nextJob.contractorPhone}`}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                        <Phone className="size-3" /> Call
                      </a>
                    )}
                    {p.nextJob?.contractorEmail && (
                      <a href={`mailto:${p.nextJob.contractorEmail}`}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                        <Mail className="size-3" /> Email
                      </a>
                    )}
                    {p.nextJob && (
                      <button
                        onClick={() => triggerJobAction({ id: p.nextJob!.id, name: p.nextJob!.name, status: "NOT_STARTED", startDate: p.nextJob!.startDate ?? null, endDate: p.nextJob!.endDate ?? null }, "start")}
                        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors">
                        <CheckCircle className="size-3" /> Confirmed — Start Job
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Inactive Plots — plots with no in-progress jobs that need attention */}
      {(data.inactivePlots ?? []).length > 0 && (
        <Card id="section-inactive-plots" className="border-amber-200 bg-amber-50/40">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("inactive-plots")}>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
              <PauseCircle className="size-4" />
              Inactive Plots ({data.inactivePlots!.length})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("inactive-plots") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs text-amber-600/80">
              Plots with no active jobs — need attention
            </CardDescription>
          </CardHeader>
          {openSections.has("inactive-plots") && (
            <CardContent className="space-y-2">
              {data.inactivePlots!.map((p) => {
                const hasContractor = p.hasContractor ?? !!p.nextJob?.contractorName;
                const ordersPending = p.ordersPending ?? 0;
                const ordersOrdered = p.ordersOrdered ?? 0;
                const ordersTotal = p.ordersTotal ?? 0;
                const allDelivered = ordersTotal === 0 || (ordersPending === 0 && ordersOrdered === 0);
                const allSent = ordersPending === 0;
                return (
                  <div key={p.id} className="rounded-xl border border-amber-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                          {p.houseType && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({p.houseType})</span>}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">{p.label}</p>
                      </div>
                      <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold",
                        p.inactivityType === "not_started" ? "bg-slate-100 text-slate-600" :
                        p.inactivityType === "deferred" ? "bg-amber-100 text-amber-700" :
                        p.inactivityType === "awaiting_contractor" ? "bg-orange-100 text-orange-700" :
                        p.inactivityType === "awaiting_materials" ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {p.inactivityType === "not_started" ? "Not Started" :
                         p.inactivityType === "deferred" ? "Deferred" :
                         p.inactivityType === "awaiting_contractor" ? "Contractor" :
                         p.inactivityType === "awaiting_materials" ? "Materials" :
                         "Waiting"}
                      </span>
                    </div>
                    {/* Checklist */}
                    {p.nextJob && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className={hasContractor ? "text-green-700" : "text-red-600"}>
                          {hasContractor ? <Check className="inline size-3 mr-0.5" /> : <X className="inline size-3 mr-0.5" />}
                          Contractor {hasContractor ? "assigned" : "not assigned"}
                        </span>
                        <span className={allSent ? "text-green-700" : "text-red-600"}>
                          {allSent ? <Check className="inline size-3 mr-0.5" /> : <X className="inline size-3 mr-0.5" />}
                          {ordersPending > 0 ? `${ordersPending} order${ordersPending !== 1 ? "s" : ""} not sent` : "Orders sent"}
                        </span>
                        <span className={allDelivered ? "text-green-700" : "text-amber-600"}>
                          {allDelivered ? <Check className="inline size-3 mr-0.5" /> : <Clock className="inline size-3 mr-0.5" />}
                          {allDelivered ? "Materials on site" : `${ordersOrdered} awaiting delivery`}
                        </span>
                      </div>
                    )}
                    {p.nextJob && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => triggerJobAction({ id: p.nextJob!.id, name: p.nextJob!.name, status: "NOT_STARTED", startDate: p.nextJob!.startDate ?? null, endDate: p.nextJob!.endDate ?? null }, "start")}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          <PlayCircle className="size-3" /> Start {p.nextJob.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Pipeline section header */}
      <div className="mt-6 flex items-center gap-2 border-b-2 border-indigo-200 pb-1">
        <GitBranch className="size-4 text-indigo-600" />
        <h2 className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Pipeline</h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">upcoming</span>
      </div>

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

        {/* Upcoming Deliveries — grouped by supplier + job name */}
        <Card id="section-upcoming-deliveries">
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("upcoming-deliveries")}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="size-4 text-blue-600" />
              Upcoming Deliveries ({data.upcomingDeliveries?.length || 0})
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("upcoming-deliveries") && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Orders sent to suppliers — awaiting delivery</CardDescription>
          </CardHeader>
          {openSections.has("upcoming-deliveries") && (
            <CardContent>
              {(!data.upcomingDeliveries || data.upcomingDeliveries.length === 0) ? (
                <p className="text-sm text-muted-foreground">No upcoming deliveries</p>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    // Group by supplier + job name
                    const grouped = new Map<string, typeof data.upcomingDeliveries>();
                    for (const d of data.upcomingDeliveries!) {
                      const key = `${d.supplier.id}__${d.job.name}`;
                      const existing = grouped.get(key) ?? [];
                      existing.push(d);
                      grouped.set(key, existing);
                    }
                    return Array.from(grouped.values()).map((group) => {
                      const first = group[0];
                      const plotLabels = group.map((d) => d.job.plot.plotNumber ? `P${d.job.plot.plotNumber}` : d.job.plot.name);
                      const allIds = group.map((d) => d.id);
                      const anyPending = allIds.some((id) => pendingOrderActions.has(id));
                      return (
                        <div key={`${first.supplier.id}__${first.job.name}`} className="rounded border p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Link href={`/suppliers/${first.supplier.id}`} className="font-medium text-blue-600 hover:underline">{first.supplier.name}</Link>
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Ordered</span>
                            {first.expectedDeliveryDate && (
                              <span className="ml-auto text-xs font-medium">{format(new Date(first.expectedDeliveryDate), "d MMM")}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{first.itemsDescription || first.job.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {first.job.name} · {plotLabels.join(", ")}{group.length > 1 ? ` (${group.length} plots)` : ""}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                            <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                            <input
                              type="date"
                              className="h-6 rounded border px-1 text-[10px] w-[110px]"
                              defaultValue={first.expectedDeliveryDate ? format(new Date(first.expectedDeliveryDate), "yyyy-MM-dd") : ""}
                              onChange={async (e) => {
                                if (!e.target.value) return;
                                for (const id of allIds) {
                                  await fetch(`/api/orders/${id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ expectedDeliveryDate: e.target.value }),
                                  });
                                }
                                setRefreshKey((k) => k + 1);
                              }}
                            />
                            <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]"
                              disabled={anyPending}
                              onClick={() => allIds.forEach((id) => handleOrderAction(id, "DELIVERED"))}>
                              {anyPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                              <span className="ml-1">Received</span>
                            </Button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </CardContent>
          )}
        </Card>

      {/* Upcoming Orders (future, scheduled) — collapsible */}
      {data.upcomingOrders.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer select-none pb-2" onClick={() => setUpcomingOrdersOpen((o) => !o)}>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-slate-500" />
              Upcoming Orders ({groupedUpcomingOrders.length})
              <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-200", upcomingOrdersOpen && "rotate-180")} />
            </CardTitle>
            <CardDescription className="text-xs">Orders scheduled for future placement — click to expand</CardDescription>
          </CardHeader>
          {upcomingOrdersOpen && (
          <CardContent>
            <div className="space-y-2">
              {groupedUpcomingOrders.map((group) => {
                const o = group[0];
                const groupIds = group.map((g) => g.id);
                const anyPending = groupIds.some((id) => pendingOrderActions.has(id));
                const mailto = o.supplier.contactEmail
                  ? buildOrderMailto(o.supplier.contactEmail, {
                      supplierName: o.supplier.name,
                      supplierContactName: o.supplier.contactName,
                      supplierAccountNumber: o.supplier.accountNumber,
                      jobName: o.job.name,
                      siteName: data.site.name,
                      siteAddress: data.site.address,
                      sitePostcode: data.site.postcode,
                      plotNumbers: group.map((g) => g.job.plot.plotNumber ? `Plot ${g.job.plot.plotNumber}` : g.job.plot.name),
                      items: (o.orderItems || []).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
                      itemsDescriptionFallback: o.itemsDescription,
                      expectedDeliveryDate: o.expectedDeliveryDate,
                      orderDate: o.dateOfOrder,
                    })
                  : null;
                return (
                  <div key={`${o.supplier.id}__${o.job.name}`} className="rounded border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/suppliers/${o.supplier.id}`} className="truncate font-medium text-blue-600 hover:underline">
                        {o.supplier.name}
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">{o.itemsDescription || "—"}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {o.dateOfOrder && (
                        <span>Order by <span className="font-medium text-purple-600">{format(new Date(o.dateOfOrder), "dd MMM")}</span></span>
                      )}
                      {o.expectedDeliveryDate && (
                        <span>Delivery by <span className="font-medium text-teal-600">{format(new Date(o.expectedDeliveryDate), "dd MMM")}</span></span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <Link href={`/jobs/${o.job.id}`} className="text-xs hover:underline hover:text-blue-600">{o.job.name}</Link>
                      <span className="text-xs text-muted-foreground">·</span>
                      {group.slice(0, 5).map((g) => (
                        <span key={g.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {g.job.plot.plotNumber ? `Plot ${g.job.plot.plotNumber}` : g.job.plot.name}
                        </span>
                      ))}
                      {group.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{group.length - 5} more</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
                      <span className="mr-auto text-[10px] font-medium text-muted-foreground">Actions</span>
                      {anyPending ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {mailto && (
                            <Button variant="outline" size="sm" className="h-6 border-violet-200 px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                              onClick={() => { window.open(mailto, "_blank"); handleGroupOrderAction(groupIds, "ORDERED"); }}>
                              <Mail className="mr-1 size-2.5" />{group.length > 1 ? `Send (${group.length})` : "Send Order"}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-6 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                            onClick={() => handleGroupOrderAction(groupIds, "ORDERED")}>
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

      {/* Delay dialog — delegated to useDelayJob hook (rendered via {delayDialogs} below). */}
      {delayDialogs}

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
              {signOffTarget?.plot?.plotNumber ? `Plot ${signOffTarget.plot.plotNumber}` : signOffTarget?.plot?.name}
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

      {/* Post-Completion Decision Dialog (unified — replaces legacy cascade dialog) */}
      <PostCompletionDialog
        open={!!completionContext}
        completedJobName={completionContext?.completedJobName ?? ""}
        daysDeviation={completionContext?.daysDeviation ?? 0}
        nextJob={completionContext?.nextJob ?? null}
        plotId={completionContext?.plotId ?? ""}
        signOffNotes={completionContext?.signOffNotes}
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
      {jobActionDialogs}

      {/* Inline Snag Dialog */}
      {inlineSnagTarget && (
        <SnagDialog
          open={!!inlineSnagTarget}
          onOpenChange={(open) => { if (!open) setInlineSnagTarget(null); }}
          plotId={inlineSnagTarget.plotId}
          initialJobId={inlineSnagTarget.jobId}
          initialContactId={inlineSnagTarget.contactId}
          onSaved={() => {
            setInlineSnagTarget(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Inline Note Dialog */}
      <Dialog open={!!noteTarget} onOpenChange={(o) => { if (!o) { setNoteTarget(null); setNoteText(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="size-4" />
              Add Note
            </DialogTitle>
            <DialogDescription>
              Note for <span className="font-medium">{noteTarget?.jobName}</span>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            className="resize-none text-sm"
            autoFocus
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={noteSubmitting || !noteText.trim()} onClick={handleAddNote}>
              {noteSubmitting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <StickyNote className="size-3.5 mr-1" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Photo Upload Dialog */}
      <Dialog open={!!photoTarget} onOpenChange={(o) => { if (!o) { setPhotoTarget(null); setPhotoFiles([]); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="size-4" />
              Upload Photos
            </DialogTitle>
            <DialogDescription>
              Photos for <span className="font-medium">{photoTarget?.jobName}</span>
            </DialogDescription>
          </DialogHeader>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
          />
          {photoFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">{photoFiles.length} photo{photoFiles.length !== 1 ? "s" : ""} selected</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={photoSubmitting || photoFiles.length === 0} onClick={handleUploadPhotos}>
              {photoSubmitting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Camera className="size-3.5 mr-1" />}
              Upload {photoFiles.length > 0 ? `(${photoFiles.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
