"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PlayCircle,
  Camera,
  StickyNote,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  X,
  ArrowLeft,
  Home,
  RefreshCw,
  User,
  HardHat,
  CalendarDays,
  ImagePlus,
  ClipboardCheck,
  ChevronsUpDown,
  Mail,
  Package,
  Truck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { format, parseISO } from "date-fns";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";
import { useJobAction } from "@/hooks/useJobAction";
import { useDelayJob } from "@/hooks/useDelayJob";
import { usePullForwardDecision } from "@/hooks/usePullForwardDecision";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WalkthroughJob {
  id: string;
  name: string;
  status: string;
  contractorName: string | null;
  assignedToName: string | null;
  startDate: string | null;
  endDate: string | null;
  photoCount: number;
  hasSignOffNotes: boolean;
  parentStageName?: string | null;
  orders?: Array<{ id: string; status: string; expectedDeliveryDate: string | null; supplier: { name: string } }>;
}

interface WalkthroughPlot {
  id: string;
  plotNumber: string;
  plotName: string | null;
  houseType: string | null;
  totalJobs: number;
  completedJobs: number;
  inProgressJobs: number;
  progressPercent: number;
  scheduleStatus: "ahead" | "on_track" | "behind" | "not_started" | "complete";
  scheduleDays: number;
  currentJob: WalkthroughJob | null;
  nextJob: { id: string; name: string; status: string; startDate: string | null; endDate: string | null; orderCount?: number } | null;
  openSnags: number;
  snagsList: Array<{
    id: string;
    description: string;
    priority: string;
    status: string;
    location: string | null;
  }>;
}

type ModalType = "finish" | "note" | "snag" | "photo" | null;

// ─── Schedule badge ───────────────────────────────────────────────────────────

function ScheduleBadge({
  status,
  days,
}: {
  status: WalkthroughPlot["scheduleStatus"];
  days: number;
}) {
  if (status === "not_started")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
        <Minus className="size-3" /> Not started
      </span>
    );
  if (status === "complete")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3" /> Complete
      </span>
    );
  if (status === "behind")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <TrendingDown className="size-3" /> {days} day{days !== 1 ? "s" : ""} behind
      </span>
    );
  if (status === "ahead")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <TrendingUp className="size-3" /> {days} day{days !== 1 ? "s" : ""} ahead
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
      <Minus className="size-3" /> On track
    </span>
  );
}

// Toast removed — uses the global useToast (same as every other screen in
// the app) so Keith only sees one toast style when moving between views.

// ─── Modal shell ─────────────────────────────────────────────────────────────
// Kept bespoke: this is a mobile-first bottom-sheet pattern used throughout
// the walkthrough. It's NOT a duplicate of Dialog — Dialog centers on mobile
// which blocks thumb reach. If we ever unify, extract this as a shared
// BottomSheetDialog component; until then it's walkthrough-specific UX.

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SiteWalkthrough({
  siteId,
}: {
  siteId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<{ siteName: string; plots: WalkthroughPlot[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [plotPickerOpen, setPlotPickerOpen] = useState(false);
  const [snagsExpanded, setSnagsExpanded] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const toast = useToast();

  // Modal state
  const [noteText, setNoteText] = useState("");
  const [noteJobId, setNoteJobId] = useState<string | null>(null); // null = current job
  const [snagDesc, setSnagDesc] = useState("");
  const [snagPriority, setSnagPriority] = useState("MEDIUM");
  const [snagLocation, setSnagLocation] = useState("");
  const [snagJobId, setSnagJobId] = useState<string | null>(null); // null = current job
  const [snagContactId, setSnagContactId] = useState<string | null>(null); // auto-filled from job
  const [snagPhotos, setSnagPhotos] = useState<File[]>([]);
  const [showJobPicker, setShowJobPicker] = useState<"snag" | "note" | null>(null);
  const [snagEmailPrompt, setSnagEmailPrompt] = useState<{ snagId: string; contractorName: string; contractorEmail: string; description: string } | null>(null);
  const [plotJobs, setPlotJobs] = useState<Array<{ id: string; name: string; status: string; parentStage: string | null; contractor: { id: string; name: string; company: string | null; email: string | null } | null }>>([]);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signOffPhotos, setSignOffPhotos] = useState<File[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [completionContext, setCompletionContext] = useState<{
    completedJobName: string;
    daysDeviation: number;
    nextJob: { id: string; name: string; contractorName: string | null; assignedToName: string | null } | null;
    plotId: string;
  } | null>(null);

  // Centralised job action hook — handles full pre-start flow for any job
  const { triggerAction: triggerJobAction, isLoading: jobActionLoading, dialogs: jobActionDialogs } = useJobAction(
    async (_action, _jobId) => {
      showToast("Done", "success");
      // Small delay to let server-side cascade finish writing before re-fetch
      await new Promise((r) => setTimeout(r, 500));
      await fetchData(true);
    }
  );

  // Centralised delay dialog — same UX as Daily Brief / JobWeekPanel so users
  // learn one concept: two input modes (by days OR by new end date) + reason
  // picker. The old walkthrough modal only accepted new-end-date which was
  // confusing mid-walk — site managers think in days ("rain pushed us 2 days").
  const { openDelayDialog, dialogs: delayDialogs } = useDelayJob(async () => {
    await fetchData(true);
  });

  // Unified pull-forward decision — manual choice from 4 options with
  // constraint-aware date picker (predecessor + order lead times).
  const { openPullForwardDialog, dialogs: pullForwardDialogs } = usePullForwardDecision(async () => {
    await fetchData(true);
  });

  // Touch/swipe
  const touchStart = useRef<number | null>(null);
  const touchDelta = useRef<number>(0);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/walkthrough`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRefreshOnFocus(fetchData);

  // Keyboard navigation
  useEffect(() => {
    if (activeModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") setActiveModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const plots = data?.plots ?? [];
  const plot = plots[currentIndex] ?? null;

  const goNext = () => {
    if (currentIndex < plots.length - 1) { setCurrentIndex((i) => i + 1); setSnagsExpanded(false); }
  };
  const goPrev = () => {
    if (currentIndex > 0) { setCurrentIndex((i) => i - 1); setSnagsExpanded(false); }
  };

  // Thin wrapper so the rest of this component can keep its `showToast`
  // call sites — all routed to the global toast system now.
  const showToast = (message: string, type: "success" | "error") => {
    if (type === "success") toast.success(message);
    else toast.error(message);
  };

  const closeModal = () => {
    setActiveModal(null);
    setNoteText("");
    setNoteJobId(null);
    setSnagDesc("");
    setSnagLocation("");
    setSnagPriority("MEDIUM");
    setSnagJobId(null);
    setSnagContactId(null);
    setSnagPhotos([]);
    setShowJobPicker(null);
    setSignOffNotes("");
    setSignOffPhotos([]);
    setPhotoFiles([]);
  };

  const refresh = async () => {
    await fetchData(true);
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  // Fetch all jobs on a plot for the job picker
  const fetchPlotJobs = async (plotId: string, autoFillJobId?: string) => {
    try {
      const res = await fetch(`/api/plots/${plotId}/jobs`);
      if (res.ok) {
        const jobs = await res.json();
        const mapped = jobs.map((j: { id: string; name: string; status: string; parentStage: string | null; contractors?: Array<{ contact: { id: string; name: string; company: string | null; email: string | null } }> }) => ({
          id: j.id, name: j.name, status: j.status, parentStage: j.parentStage,
          contractor: j.contractors?.[0]?.contact ?? null,
        }));
        setPlotJobs(mapped);
        // Auto-fill contractor from the current/selected job
        const targetId = autoFillJobId || job?.id;
        if (targetId) {
          const match = mapped.find((j: { id: string; contractor: { id: string } | null }) => j.id === targetId);
          if (match?.contractor) {
            setSnagContactId(match.contractor.id);
          }
        }
      }
    } catch { /* non-critical */ }
  };

  // Fetch orders for a job on demand (avoids loading all orders upfront)
  const fetchJobOrders = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        return (data.orders ?? []).map((o: { id: string; status: string; expectedDeliveryDate: string | null; supplier: { name: string } }) => ({ id: o.id, status: o.status, expectedDeliveryDate: o.expectedDeliveryDate ?? null, supplier: { name: o.supplier?.name || "Unknown" } }));
      }
    } catch { /* non-critical */ }
    return [];
  };

  const handleStartNext = async () => {
    if (!plot?.nextJob) return;
    const orders = await fetchJobOrders(plot.nextJob.id);
    await triggerJobAction(
      { id: plot.nextJob.id, name: plot.nextJob.name, status: plot.nextJob.status, startDate: plot.nextJob.startDate ?? null, endDate: plot.nextJob.endDate ?? null, orders },
      "start"
    );
  };

  const handleStartCurrentJob = async () => {
    if (!plot?.currentJob || plot.currentJob.status !== "NOT_STARTED") return;
    const orders = await fetchJobOrders(plot.currentJob.id);
    await triggerJobAction(
      {
        id: plot.currentJob.id,
        name: plot.currentJob.name,
        status: plot.currentJob.status,
        startDate: plot.currentJob.startDate,
        endDate: plot.currentJob.endDate,
        orders,
      },
      "start"
    );
  };

  const handleFinishJob = async () => {
    if (!plot?.currentJob) return;
    setActionLoading(true);
    try {
      // Upload photos first if any
      if (signOffPhotos.length > 0) {
        const fd = new FormData();
        signOffPhotos.forEach((f) => fd.append("photos", f));
        const photoRes = await fetch(`/api/jobs/${plot.currentJob.id}/photos`, {
          method: "POST",
          body: fd,
        });
        if (!photoRes.ok) {
          showToast("Photos failed to upload — sign-off cancelled", "error");
          setActionLoading(false);
          return;
        }
      }
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          signOffNotes: signOffNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const completedName = plot.currentJob.name;
        closeModal();
        showToast(`Signed off: ${completedName}`, "success");
        await refresh();
        // Show post-completion decision dialog
        if (result._completionContext) {
          setCompletionContext({
            completedJobName: completedName,
            daysDeviation: result._completionContext.daysDeviation,
            nextJob: result._completionContext.nextJob,
            plotId: result._completionContext.plotId,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to sign off job", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!plot?.currentJob || !noteText.trim()) return;
    setActionLoading(true);
    try {
      const targetJobId = noteJobId || plot.currentJob.id;
      const res = await fetch(`/api/jobs/${targetJobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: noteText.trim() }),
      });
      if (res.ok) {
        closeModal();
        showToast("Note added", "success");
        await refresh();
      } else {
        showToast("Failed to add note", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSnag = async () => {
    if (!plot || !snagDesc.trim()) return;
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {
        description: snagDesc.trim(),
        priority: snagPriority,
      };
      if (snagLocation.trim()) body.location = snagLocation.trim();
      // Use selected job or default to current job
      const targetJobId = snagJobId || plot.currentJob?.id;
      if (targetJobId) body.jobId = targetJobId;
      // Include contractor
      if (snagContactId) body.contactId = snagContactId;

      const res = await fetch(`/api/plots/${plot.id}/snags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const snagData = await res.json();
        // Upload photos if any were taken
        if (snagPhotos.length > 0) {
          const fd = new FormData();
          snagPhotos.forEach((f) => fd.append("photos", f));
          await fetch(`/api/snags/${snagData.id}/photos`, { method: "POST", body: fd });
        }
        closeModal();
        showToast("Snag raised", "success");
        await refresh();

        // Prompt to email contractor if they have an email
        const contractor = snagContactId
          ? plotJobs.find((j) => j.contractor?.id === snagContactId)?.contractor
          : null;
        if (contractor?.email) {
          setSnagEmailPrompt({
            snagId: snagData.id,
            contractorName: contractor.company || contractor.name,
            contractorEmail: contractor.email,
            description: snagDesc.trim(),
          });
        }
      } else {
        showToast("Failed to raise snag", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPhotos = async () => {
    if (!plot?.currentJob || photoFiles.length === 0) return;
    setActionLoading(true);
    try {
      const fd = new FormData();
      photoFiles.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/photos`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        closeModal();
        showToast(`${photoFiles.length} photo${photoFiles.length !== 1 ? "s" : ""} uploaded`, "success");
        await refresh();
      } else {
        showToast("Failed to upload photos", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Touch handlers ────────────────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.targetTouches[0].clientX;
    touchDelta.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    touchDelta.current = touchStart.current - e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStart.current === null) return;
    if (touchDelta.current > 50) goNext();
    else if (touchDelta.current < -50) goPrev();
    touchStart.current = null;
    touchDelta.current = 0;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || plots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Home className="size-10 opacity-30" />
        <p className="text-sm">No plots on this site yet.</p>
        <button
          onClick={() => router.push(`/sites/${siteId}?tab=plots`)}
          className="mt-1 text-xs text-blue-600 underline"
        >
          Go to Plots
        </button>
      </div>
    );
  }

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === plots.length - 1;
  const job = plot?.currentJob ?? null;
  const canFinish = job?.status === "IN_PROGRESS";
  const canStart = job?.status === "NOT_STARTED";
  const canStartNext = !!plot?.nextJob && job?.status === "IN_PROGRESS";

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 bg-white px-4 py-3">
        <button
          onClick={() => router.back()}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {data.siteName}
          </p>
          <Breadcrumbs items={[
            { label: "Sites", href: "/sites" },
            { label: data.siteName, href: `/sites/${siteId}` },
            { label: "Walkthrough" },
          ]} />
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Plot navigator */}
      <div className="flex items-center justify-between border-b border-border/30 bg-white px-4 py-2.5">
        <button
          onClick={goPrev}
          disabled={isFirst}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>

        {/* Centre: dot indicators + jump button */}
        <div className="flex items-center gap-2">
          {/* Dot indicators (show up to 8, collapse beyond) */}
          {plots.length <= 12 && (
            <div className="flex items-center gap-1.5">
              {plots.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setCurrentIndex(i)}
                  title={p.plotNumber ? `Plot ${p.plotNumber}` : (p.plotName || "Plot")}
                  className={cn(
                    "h-2 rounded-full transition-all duration-200",
                    i === currentIndex
                      ? "w-5 bg-blue-600"
                      : "w-2 bg-slate-300 hover:bg-slate-400"
                  )}
                />
              ))}
            </div>
          )}

          {/* Jump to plot dropdown */}
          <div className="relative">
            <button
              onClick={() => setPlotPickerOpen((o) => !o)}
              className="flex items-center gap-1 rounded-lg border border-border/60 bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <span>{currentIndex + 1} / {plots.length}</span>
              <ChevronsUpDown className="size-3" />
            </button>
            {plotPickerOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-1 max-h-64 w-48 -translate-x-1/2 overflow-y-auto rounded-xl border bg-white shadow-lg">
                {plots.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => { setCurrentIndex(i); setPlotPickerOpen(false); setSnagsExpanded(false); }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent",
                      i === currentIndex && "bg-blue-50 font-semibold text-blue-700"
                    )}
                  >
                    <span>{p.plotNumber ? `Plot ${p.plotNumber}` : (p.plotName || "Plot")}</span>
                    {p.currentJob && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        p.currentJob.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                        p.currentJob.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {p.currentJob.status === "IN_PROGRESS" ? "Active" :
                         p.currentJob.status === "COMPLETED" ? "Done" : "Pending"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={goNext}
          disabled={isLast}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Card area — swipeable */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {plot && (
          <div className="mx-auto max-w-lg p-4 pb-6">
            {/* Plot card */}
            <div
              className={cn(
                "rounded-2xl border bg-white shadow-sm",
                plot.scheduleStatus === "behind"
                  ? "border-red-200"
                  : plot.scheduleStatus === "ahead"
                  ? "border-emerald-200"
                  : "border-border/60"
              )}
            >
              {/* Card header */}
              <div className="border-b border-border/40 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Plot {plot.plotNumber} · {plots.length > 1 ? `${currentIndex + 1} of ${plots.length}` : "only plot"}
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold text-foreground">
                      <Link href={`/sites/${siteId}/plots/${plot.id}`} className="hover:underline">
                        {plot.plotName || plot.houseType || `Plot ${plot.plotNumber}`}
                      </Link>
                    </h2>
                    {plot.houseType && plot.plotName && (
                      <p className="text-xs text-muted-foreground">{plot.houseType}</p>
                    )}
                  </div>
                  <ScheduleBadge status={plot.scheduleStatus} days={plot.scheduleDays} />
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{plot.completedJobs} of {plot.totalJobs} jobs complete</span>
                    <span className="font-semibold text-foreground">{plot.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        plot.progressPercent === 100
                          ? "bg-emerald-500"
                          : plot.scheduleStatus === "behind"
                          ? "bg-red-500"
                          : "bg-blue-500"
                      )}
                      style={{ width: `${plot.progressPercent}%` }}
                    />
                  </div>
                  {/* Job stage timeline mini-bar */}
                  {plot.totalJobs > 0 && (
                    <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      {plot.completedJobs > 0 && (
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(plot.completedJobs / plot.totalJobs) * 100}%` }}
                        />
                      )}
                      {plot.inProgressJobs > 0 && (
                        <div
                          className="bg-blue-500"
                          style={{ width: `${(plot.inProgressJobs / plot.totalJobs) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Current job details */}
              <div className="px-5 py-4">
                {job ? (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {job.status === "IN_PROGRESS" ? "Current Job" : "Next to Start"}
                      </p>
                      {job.parentStageName && (
                        <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{job.parentStageName}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            job.status === "IN_PROGRESS"
                              ? "bg-blue-500 animate-pulse"
                              : "bg-slate-300"
                          )}
                        />
                        <Link href={`/jobs/${job.id}`} className="text-base font-semibold text-blue-600 hover:underline">{job.name}</Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {job.contractorName && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <HardHat className="size-3.5 shrink-0" />
                          <span className="truncate text-xs">{job.contractorName}</span>
                        </div>
                      )}
                      {job.assignedToName && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="size-3.5 shrink-0" />
                          <span className="truncate text-xs">{job.assignedToName}</span>
                        </div>
                      )}
                      {job.endDate && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="size-3.5 shrink-0" />
                          <span className="text-xs">Due {format(parseISO(job.endDate), "d MMM")}</span>
                        </div>
                      )}
                      {job.photoCount > 0 && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Camera className="size-3.5 shrink-0" />
                          <span className="text-xs">{job.photoCount} photo{job.photoCount !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                    </div>

                    {/* Order / delivery status summary */}
                    {(() => {
                      const orders = job.orders ?? [];
                      const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
                      if (nonCancelled.length === 0) return null;
                      const allDelivered = nonCancelled.every((o) => o.status === "DELIVERED");
                      if (allDelivered) {
                        return (
                          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                            <Package className="size-3.5" />
                            All materials on site
                          </p>
                        );
                      }
                      const pending = nonCancelled.filter((o) => o.status === "PENDING").length;
                      const ordered = nonCancelled.filter((o) => o.status === "ORDERED" || o.status === "CONFIRMED").length;
                      const upcoming = nonCancelled.filter((o) => o.status !== "DELIVERED" && o.expectedDeliveryDate);
                      const nextDelivery = upcoming.length > 0
                        ? upcoming.sort((a, b) => a.expectedDeliveryDate!.localeCompare(b.expectedDeliveryDate!))[0]
                        : null;
                      const parts: string[] = [];
                      if (pending > 0) parts.push(`${pending} pending`);
                      if (ordered > 0) parts.push(`${ordered} ordered`);
                      return (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {parts.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Package className="size-3.5 shrink-0" />
                              {parts.join(" \u00B7 ")}
                            </span>
                          )}
                          {nextDelivery && (
                            <span className="flex items-center gap-1">
                              <Truck className="size-3.5 shrink-0" />
                              {upcoming.length} due {format(parseISO(nextDelivery.expectedDeliveryDate!), "d MMM")}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {!job.contractorName && !job.assignedToName && (
                      <p className="flex items-center gap-1.5 text-xs text-amber-600">
                        <AlertTriangle className="size-3.5" />
                        No contractor or assignee set
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">All jobs complete on this plot.</p>
                )}

                {/* Open snags — expandable */}
                {plot.openSnags > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setSnagsExpanded((e) => !e)}
                      className="flex w-full items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5" />
                        {plot.openSnags} open snag{plot.openSnags !== 1 ? "s" : ""}
                      </span>
                      <ChevronRight className={cn("size-3.5 transition-transform", snagsExpanded && "rotate-90")} />
                    </button>
                    {snagsExpanded && (
                      <div className="mt-1 space-y-1">
                        {plot.snagsList.map((snag) => {
                          const priorityColor =
                            snag.priority === "CRITICAL" ? "text-red-600" :
                            snag.priority === "HIGH" ? "text-orange-600" :
                            "text-amber-600";
                          return (
                            <Link
                              key={snag.id}
                              href={`/sites/${siteId}?tab=snags&snagId=${snag.id}`}
                              className="flex w-full items-start gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-left hover:bg-amber-50 transition-colors"
                            >
                              <AlertTriangle className={cn("size-3.5 mt-0.5 shrink-0", priorityColor)} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground line-clamp-2">{snag.description}</p>
                                {snag.location && (
                                  <p className="text-[10px] text-muted-foreground">{snag.location}</p>
                                )}
                              </div>
                              <span className={cn("shrink-0 text-[10px] font-semibold uppercase", priorityColor)}>
                                {snag.priority}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Next job preview */}
                {plot.nextJob && job?.status === "IN_PROGRESS" && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Up next
                    </p>
                    <Link href={`/jobs/${plot.nextJob.id}`} className="mt-0.5 text-sm font-medium text-blue-600 hover:underline">{plot.nextJob.name}</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── Action grid ──────────────────────────────────────────────── */}
            <div className="mt-4 space-y-2.5">

              {/* Primary row */}
              <div className="grid grid-cols-2 gap-2.5">
                {canFinish && (
                  <button
                    onClick={() => setActiveModal("finish")}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 disabled:opacity-60 transition-all"
                  >
                    <ClipboardCheck className="size-4" />
                    Sign Off Job
                  </button>
                )}
                {canStart && (
                  <button
                    onClick={handleStartCurrentJob}
                    disabled={actionLoading || jobActionLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-60 transition-all"
                  >
                    {jobActionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PlayCircle className="size-4" />
                    )}
                    Start {plot.currentJob?.name || "Job"}
                  </button>
                )}
                {canStartNext && (
                  <button
                    onClick={handleStartNext}
                    disabled={actionLoading || jobActionLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-60 transition-all"
                  >
                    {jobActionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PlayCircle className="size-4" />
                    )}
                    Start {plot.nextJob?.name || "Next"}
                  </button>
                )}
                {/* If no primary action, show "All done" placeholder */}
                {!canFinish && !canStart && !canStartNext && plot.progressPercent === 100 && (
                  <div className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    Plot Complete
                  </div>
                )}
              </div>

              {/* Secondary row — photos, note, snag */}
              {job && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setActiveModal("photo")}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-3 text-xs font-medium text-foreground hover:bg-accent active:scale-95 transition-all shadow-sm"
                  >
                    <ImagePlus className="size-5 text-blue-500" />
                    Photos
                  </button>
                  <button
                    onClick={() => setActiveModal("note")}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-3 text-xs font-medium text-foreground hover:bg-accent active:scale-95 transition-all shadow-sm"
                  >
                    <StickyNote className="size-5 text-slate-500" />
                    Note
                  </button>
                  <button
                    onClick={() => { setActiveModal("snag"); if (plot) fetchPlotJobs(plot.id); }}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-3 text-xs font-medium text-foreground hover:bg-accent active:scale-95 transition-all shadow-sm"
                  >
                    <AlertTriangle className="size-5 text-amber-500" />
                    Snag
                  </button>
                </div>
              )}

              {/* Snag only row — when no active job */}
              {!job && (
                <button
                  onClick={() => { setActiveModal("snag"); if (plot) fetchPlotJobs(plot.id); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50 active:scale-95 transition-all shadow-sm"
                >
                  <AlertTriangle className="size-4" />
                  Raise Snag
                </button>
              )}

              {/* Delay + Pull Forward — both available for IN_PROGRESS and NOT_STARTED.
                  Delay pushes job + downstream back. Pull Forward moves just this
                  job earlier (4 options with constraint-aware date picker). Same
                  UX as Programme panel / Daily Brief. */}
              {(canFinish || canStart) && job && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openPullForwardDialog(job)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all"
                  >
                    <Zap className="size-4" />
                    Pull Forward
                  </button>
                  <button
                    onClick={() => openDelayDialog(job)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 active:scale-95 transition-all"
                  >
                    <Clock className="size-4" />
                    Delay Job
                  </button>
                </div>
              )}

              {/* Quick plot navigation */}
              <div className="mt-2 flex gap-2">
                <Link
                  href={`/sites/${siteId}/plots/${plot.id}`}
                  className="flex-1 rounded-xl border border-border/40 bg-white px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent transition-colors text-center"
                >
                  View Plot Detail
                </Link>
                <button
                  onClick={() => router.push(`/sites/${siteId}?tab=programme`)}
                  className="flex-1 rounded-xl border border-border/40 bg-white px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  View Programme
                </button>
                <button
                  onClick={() => router.push(`/sites/${siteId}?tab=snags`)}
                  className="flex-1 rounded-xl border border-border/40 bg-white px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  All Snags
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Sign Off */}
      {activeModal === "finish" && job && (
        <Modal title={`Sign Off: ${job.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Sign-off notes (optional)
              </label>
              <textarea
                value={signOffNotes}
                onChange={(e) => setSignOffNotes(e.target.value)}
                placeholder="Work completed, any issues or handover notes..."
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Photos (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setSignOffPhotos(Array.from(e.target.files ?? []))}
                className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700"
              />
              {signOffPhotos.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {signOffPhotos.length} photo{signOffPhotos.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishJob}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Confirm Sign Off
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Note */}
      {activeModal === "note" && job && (
        <Modal title={`Add Note: ${noteJobId ? plotJobs.find((j) => j.id === noteJobId)?.name || "Selected job" : job.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Site note, observation or instruction..."
              rows={5}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {/* Job assignment */}
            <div className="text-xs text-muted-foreground">
              For: <span className="font-medium text-foreground">
                {noteJobId ? plotJobs.find((j) => j.id === noteJobId)?.name || "Selected job" : job.name}
              </span>
              <button
                onClick={() => { setShowJobPicker("note"); if (plot) fetchPlotJobs(plot.id); }}
                className="ml-2 text-blue-600 hover:underline"
              >
                Change job
              </button>
            </div>
            {showJobPicker === "note" && plotJobs.length > 0 && (
              <select
                value={noteJobId || job.id}
                onChange={(e) => { setNoteJobId(e.target.value || null); setShowJobPicker(null); }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {plotJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.parentStage ? `  ${j.name}` : j.name} ({j.status === "COMPLETED" ? "Completed" : j.status === "IN_PROGRESS" ? "In Progress" : "Not Started"})
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button onClick={closeModal} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={actionLoading || !noteText.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <StickyNote className="size-4" />}
                Save Note
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Snag */}
      {activeModal === "snag" && (
        <Modal title="Raise Snag" onClose={closeModal}>
          <div className="space-y-3">
            {/* Quick Snap button */}
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 py-3 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors">
                <Camera className="size-4" />
                {snagPhotos.length > 0 ? `${snagPhotos.length} photo${snagPhotos.length > 1 ? "s" : ""} attached` : "Take Photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) setSnagPhotos(Array.from(e.target.files)); }}
                />
              </label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Description *
              </label>
              <textarea
                value={snagDesc}
                onChange={(e) => setSnagDesc(e.target.value)}
                placeholder="Describe the snag..."
                rows={3}
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
                <select
                  value={snagPriority}
                  onChange={(e) => setSnagPriority(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
                <input
                  type="text"
                  value={snagLocation}
                  onChange={(e) => setSnagLocation(e.target.value)}
                  placeholder="e.g. Kitchen"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Job assignment — smart default + change */}
            <div className="text-xs text-muted-foreground">
              Linked to: <span className="font-medium text-foreground">
                {snagJobId ? plotJobs.find((j) => j.id === snagJobId)?.name || "Selected job" : job?.name || "Current job"}
              </span>
              <button
                onClick={() => { setShowJobPicker("snag"); if (plot) fetchPlotJobs(plot.id); }}
                className="ml-2 text-blue-600 hover:underline"
              >
                Change job
              </button>
            </div>
            {showJobPicker === "snag" && plotJobs.length > 0 && (
              <select
                value={snagJobId || job?.id || ""}
                onChange={(e) => {
                  const selectedId = e.target.value || null;
                  setSnagJobId(selectedId);
                  setShowJobPicker(null);
                  // Auto-fill contractor from selected job
                  const selectedJob = plotJobs.find((j) => j.id === selectedId);
                  if (selectedJob?.contractor) {
                    setSnagContactId(selectedJob.contractor.id);
                  }
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {plotJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.parentStage ? `  ${j.name}` : j.name} ({j.status === "COMPLETED" ? "Completed" : j.status === "IN_PROGRESS" ? "In Progress" : "Not Started"})
                  </option>
                ))}
              </select>
            )}
            {/* Contractor — auto-filled from job, can override */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Contractor</label>
              <select
                value={snagContactId || ""}
                onChange={(e) => setSnagContactId(e.target.value || null)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {(() => {
                  // Deduplicate contractors from plotJobs
                  const seen = new Set<string>();
                  return plotJobs.filter((j) => {
                    if (!j.contractor || seen.has(j.contractor.id)) return false;
                    seen.add(j.contractor.id);
                    return true;
                  }).map((j) => (
                    <option key={j.contractor!.id} value={j.contractor!.id}>
                      {j.contractor!.company || j.contractor!.name}{j.contractor!.email ? "" : " (no email)"}
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={closeModal} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
              <button
                onClick={handleAddSnag}
                disabled={actionLoading || !snagDesc.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
                Raise Snag
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Email contractor prompt after snag */}
      {snagEmailPrompt && (
        <Modal title="Notify Contractor?" onClose={() => setSnagEmailPrompt(null)}>
          <div className="space-y-3 p-1">
            <p className="text-sm text-muted-foreground">
              Snag raised and assigned to <span className="font-medium text-foreground">{snagEmailPrompt.contractorName}</span>. Would you like to email them?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSnagEmailPrompt(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent"
              >
                Skip
              </button>
              <a
                href={`mailto:${snagEmailPrompt.contractorEmail}?subject=${encodeURIComponent(`Snag Raised — ${data?.siteName || "Site"}`)}&body=${encodeURIComponent(`Hi,\n\nA snag has been raised that requires your attention:\n\n${snagEmailPrompt.description}\n\nPlease review and action at your earliest convenience.\n\nRegards`)}`}
                onClick={() => setSnagEmailPrompt(null)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Mail className="size-4" />
                Email
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Photos */}
      {activeModal === "photo" && job && (
        <Modal title={`Add Photos: ${job.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
              />
              {photoFiles.length > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {photoFiles.length} photo{photoFiles.length !== 1 ? "s" : ""} selected
                </p>
              )}
              {job.photoCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.photoCount} existing photo{job.photoCount !== 1 ? "s" : ""} on this job
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={closeModal} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
              <button
                onClick={handleAddPhotos}
                disabled={actionLoading || photoFiles.length === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                Upload
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Unified delay dialog (useDelayJob) — both input modes + reason */}
      {delayDialogs}

      {/* Unified pull-forward dialog (usePullForwardDecision) */}
      {pullForwardDialogs}

      {/* Toast now rendered by the global <Toaster> — no local instance here. */}

      {/* Post-completion decision dialog */}
      {completionContext && (
        <PostCompletionDialog
          open={true}
          completedJobName={completionContext.completedJobName}
          daysDeviation={completionContext.daysDeviation}
          nextJob={completionContext.nextJob}
          plotId={completionContext.plotId}
          onClose={() => setCompletionContext(null)}
          onDecisionMade={() => { setCompletionContext(null); refresh(); }}
        />
      )}

      {/* Centralised pre-start / early-start / order-conflict dialogs */}
      {jobActionDialogs}
    </div>
  );
}
