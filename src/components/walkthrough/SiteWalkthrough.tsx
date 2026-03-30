"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";

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
}

interface WalkthroughPlot {
  id: string;
  plotNumber: string;
  plotName: string | null;
  houseType: string | null;
  totalJobs: number;
  completedJobs: number;
  progressPercent: number;
  scheduleStatus: "ahead" | "on_track" | "behind" | "not_started" | "complete";
  scheduleDays: number;
  currentJob: WalkthroughJob | null;
  nextJob: { id: string; name: string; status: string } | null;
  openSnags: number;
}

type ModalType = "finish" | "note" | "snag" | "photo" | "delay" | null;

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

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl",
        type === "success" ? "bg-emerald-600" : "bg-red-600"
      )}
    >
      {message}
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

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
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Modal state
  const [noteText, setNoteText] = useState("");
  const [snagDesc, setSnagDesc] = useState("");
  const [snagPriority, setSnagPriority] = useState("MEDIUM");
  const [snagLocation, setSnagLocation] = useState("");
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signOffPhotos, setSignOffPhotos] = useState<File[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [newEndDate, setNewEndDate] = useState("");
  const [cascadePreview, setCascadePreview] = useState<{ deltaDays: number; jobUpdates: unknown[] } | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [completionContext, setCompletionContext] = useState<{
    completedJobName: string;
    daysDeviation: number;
    nextJob: { id: string; name: string; contractorName: string | null; assignedToName: string | null } | null;
    plotId: string;
  } | null>(null);

  // Touch/swipe
  const touchStart = useRef<number | null>(null);

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
    if (currentIndex < plots.length - 1) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  const closeModal = () => {
    setActiveModal(null);
    setNoteText("");
    setSnagDesc("");
    setSnagLocation("");
    setSnagPriority("MEDIUM");
    setSignOffNotes("");
    setSignOffPhotos([]);
    setPhotoFiles([]);
    setNewEndDate("");
    setCascadePreview(null);
  };

  const refresh = async () => {
    await fetchData(true);
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleStartNext = async () => {
    if (!plot?.nextJob) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/jobs/${plot.nextJob.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        showToast(`Started: ${plot.nextJob.name}`, "success");
        await refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to start job", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartCurrentJob = async () => {
    if (!plot?.currentJob || plot.currentJob.status !== "NOT_STARTED") return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        showToast(`Started: ${plot.currentJob.name}`, "success");
        await refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to start job", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinishJob = async () => {
    if (!plot?.currentJob) return;
    setActionLoading(true);
    try {
      // Upload photos first if any
      if (signOffPhotos.length > 0) {
        const fd = new FormData();
        signOffPhotos.forEach((f) => fd.append("photos", f));
        await fetch(`/api/jobs/${plot.currentJob.id}/photos`, {
          method: "POST",
          body: fd,
        });
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
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: noteText.trim() }),
      });
      if (res.ok) {
        closeModal();
        showToast("Note added", "success");
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
      if (plot.currentJob?.id) body.jobId = plot.currentJob.id;

      const res = await fetch(`/api/plots/${plot.id}/snags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        closeModal();
        showToast("Snag raised", "success");
        await refresh();
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

  const handlePreviewDelay = async () => {
    if (!plot?.currentJob || !newEndDate) return;
    setCascadeLoading(true);
    try {
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/cascade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate }),
      });
      if (res.ok) {
        const preview = await res.json();
        setCascadePreview(preview);
      } else {
        showToast("Could not preview delay", "error");
      }
    } finally {
      setCascadeLoading(false);
    }
  };

  const handleApplyDelay = async () => {
    if (!plot?.currentJob || !newEndDate) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/jobs/${plot.currentJob.id}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate, confirm: true }),
      });
      if (res.ok) {
        closeModal();
        showToast("Delay applied & schedule updated", "success");
        await refresh();
      } else {
        showToast("Failed to apply delay", "error");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Touch handlers ────────────────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dist = touchStart.current - e.changedTouches[0].clientX;
    if (dist > 60) goNext();
    else if (dist < -60) goPrev();
    touchStart.current = null;
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
          onClick={() => router.push(`/sites/${siteId}?tab=daily-brief`)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {data.siteName}
          </p>
          <p className="text-[11px] text-muted-foreground">Site Walkthrough</p>
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

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {plots.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setCurrentIndex(i)}
              title={`Plot ${p.plotNumber}`}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                i === currentIndex
                  ? "w-5 bg-blue-600"
                  : "w-2 bg-slate-300 hover:bg-slate-400"
              )}
            />
          ))}
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
                      {plot.plotName || plot.houseType || `Plot ${plot.plotNumber}`}
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
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            job.status === "IN_PROGRESS"
                              ? "bg-blue-500 animate-pulse"
                              : "bg-slate-300"
                          )}
                        />
                        <p className="text-base font-semibold text-foreground">{job.name}</p>
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

                {/* Open snags indicator */}
                {plot.openSnags > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    <AlertTriangle className="size-3.5" />
                    {plot.openSnags} open snag{plot.openSnags !== 1 ? "s" : ""}
                  </div>
                )}

                {/* Next job preview */}
                {plot.nextJob && job?.status === "IN_PROGRESS" && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Up next
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{plot.nextJob.name}</p>
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
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-60 transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PlayCircle className="size-4" />
                    )}
                    Start Job
                  </button>
                )}
                {canStartNext && (
                  <button
                    onClick={handleStartNext}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-60 transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PlayCircle className="size-4" />
                    )}
                    Start Next
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
                    onClick={() => setActiveModal("snag")}
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
                  onClick={() => setActiveModal("snag")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50 active:scale-95 transition-all shadow-sm"
                >
                  <AlertTriangle className="size-4" />
                  Raise Snag
                </button>
              )}

              {/* Delay row */}
              {canFinish && (
                <button
                  onClick={() => setActiveModal("delay")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 active:scale-95 transition-all"
                >
                  <Clock className="size-4" />
                  Delay / Push Job
                </button>
              )}

              {/* Quick plot navigation */}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => router.push(`/sites/${siteId}?tab=plots`)}
                  className="flex-1 rounded-xl border border-border/40 bg-white px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  View Plot Detail
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
        <Modal title={`Add Note: ${job.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Site note, observation or instruction..."
              rows={5}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
            {job && (
              <p className="text-xs text-muted-foreground">
                Will be linked to: <span className="font-medium text-foreground">{job.name}</span>
              </p>
            )}
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

      {/* Delay / Push */}
      {activeModal === "delay" && job && (
        <Modal title={`Delay: ${job.name}`} onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                New completion date
              </label>
              {job.endDate && (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Currently due: <span className="font-medium text-foreground">{format(parseISO(job.endDate), "d MMM yyyy")}</span>
                </p>
              )}
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => {
                  setNewEndDate(e.target.value);
                  setCascadePreview(null);
                }}
                min={job.endDate ? job.endDate.slice(0, 10) : undefined}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {cascadePreview && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">
                  {cascadePreview.deltaDays > 0 ? `+${cascadePreview.deltaDays}` : cascadePreview.deltaDays} day
                  {Math.abs(cascadePreview.deltaDays) !== 1 ? "s" : ""}
                </p>
                <p className="text-xs mt-0.5">
                  {(cascadePreview.jobUpdates as unknown[]).length} subsequent job
                  {(cascadePreview.jobUpdates as unknown[]).length !== 1 ? "s" : ""} will be rescheduled
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={closeModal} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
              {!cascadePreview ? (
                <button
                  onClick={handlePreviewDelay}
                  disabled={cascadeLoading || !newEndDate}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-700 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {cascadeLoading ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
                  Preview Impact
                </button>
              ) : (
                <button
                  onClick={handleApplyDelay}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
                  Apply Delay
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

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
    </div>
  );
}
