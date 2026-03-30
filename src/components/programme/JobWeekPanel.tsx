"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format, differenceInCalendarDays, addDays } from "date-fns";
import Link from "next/link";
import {
  Loader2,
  ArrowRight,
  CalendarDays,
  StickyNote,
  Send,
  Camera,
  Upload,
  X,
  ImageIcon,
  ShoppingCart,
  Truck,
  CircleCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  HardHat,
  Check,
  Play,
  Pause,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getStageCode, getStageColor } from "@/lib/stage-codes";
import { SnagDialog } from "@/components/snags/SnagDialog";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";

// ---------- Types ----------

interface JobPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  tag: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface JobAction {
  id: string;
  action: string;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string };
  jobName?: string;
}

interface PanelOrder {
  id: string;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  leadTimeDays: number | null;
  status: string;
  itemsDescription?: string | null;
  supplier: { name: string };
  orderItems?: Array<{ description: string | null; quantity: number }>;
}

interface PanelJob {
  id: string;
  name: string;
  status: string;
  stageCode: string | null;
  startDate: string | null;
  endDate: string | null;
  orders?: PanelOrder[];
}

interface PanelContext {
  job: PanelJob;
  plotName: string;
  plotId: string;
  siteName: string;
  siteId: string;
  childJobIds?: string[];
}

interface JobWeekPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PanelContext | null;
  onOrderUpdated?: () => void;
  onJobUpdated?: () => void;
}

// ---------- Status Config ----------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NOT_STARTED: {
    label: "Not Started",
    className: "bg-slate-100 text-slate-600",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-amber-100 text-amber-700",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
  },
};

const ACTION_LABELS: Record<string, string> = {
  start: "Started",
  stop: "Stopped",
  complete: "Signed Off",
  edit: "Edited",
  note: "Note",
};

// ---------- Notes Sub-Component ----------

function NotesSection({
  actions,
  noteText,
  setNoteText,
  submittingNote,
  handleAddNote,
  isSynthetic,
}: {
  actions: JobAction[];
  noteText: string;
  setNoteText: (v: string) => void;
  submittingNote: boolean;
  handleAddNote: () => void;
  isSynthetic?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNotes = actions.length > 0;
  const showExpanded = hasNotes || expanded;

  // For synthetic parents with no notes, don't show the add note button
  if (!showExpanded && isSynthetic) return null;

  if (!showExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs text-muted-foreground"
        onClick={() => setExpanded(true)}
      >
        <StickyNote className="size-3.5" />
        Add a Note
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StickyNote className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Notes & Actions</h4>
        {hasNotes && (
          <span className="text-xs text-muted-foreground">
            ({actions.length})
          </span>
        )}
      </div>

      {/* Add Note — not available for synthetic parent views */}
      {!isSynthetic && (
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            className="text-sm"
            autoFocus={!hasNotes}
          />
          <Button
            size="sm"
            onClick={handleAddNote}
            disabled={submittingNote || !noteText.trim()}
            className="shrink-0 self-end"
          >
            {submittingNote ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
      )}

      {/* Notes timeline */}
      {hasNotes && (
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {actions.map((a) => {
            const label = ACTION_LABELS[a.action] || a.action;
            const isNote = a.action === "note";

            return (
              <div
                key={a.id}
                className={`rounded-lg border p-2.5 text-sm ${
                  isNote
                    ? "border-amber-200 bg-amber-50/50"
                    : "bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {isNote ? "\ud83d\udcdd" : "\u26a1"} {label} by {a.user.name}
                    {a.jobName && (
                      <span className="ml-1 text-[10px] text-muted-foreground/70">
                        — {a.jobName}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(a.createdAt), "d MMM HH:mm")}
                  </span>
                </div>
                {a.notes && (
                  <p className="mt-1 text-sm">{a.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Component ----------

export function JobWeekPanel({ open, onOpenChange, context, onOrderUpdated, onJobUpdated }: JobWeekPanelProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [actions, setActions] = useState<JobAction[]>([]);
  const [orders, setOrders] = useState<PanelOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningIds, setActioningIds] = useState<Set<string>>(new Set());
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  // Snag state
  const [snagDialogOpen, setSnagDialogOpen] = useState(false);
  const [snagPhotoAttachments, setSnagPhotoAttachments] = useState<Array<{ url: string; fileName: string }>>([]);
  const [jobContractorContactId, setJobContractorContactId] = useState<string | null>(null);

  // Order detail sheet state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);

  // Post-upload snag prompt
  const [snagPromptPhotos, setSnagPromptPhotos] = useState<JobPhoto[] | null>(null);

  // Contractor state
  const [panelContractors, setPanelContractors] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [allContractors, setAllContractors] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [contractorPickerTargetJobId, setContractorPickerTargetJobId] = useState<string | null>(null);
  const [selectedContractorIds, setSelectedContractorIds] = useState<Set<string>>(new Set());
  const [savingContractors, setSavingContractors] = useState(false);
  // Per-child-job contractors (for synthetic parent panels)
  const [childJobContractors, setChildJobContractors] = useState<Map<string, { id: string; name: string; company: string | null } | null>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isSynthetic = context?.job.id.startsWith("synth-") ?? false;

  // Local job status (updated optimistically after actions)
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [jobActionLoading, setJobActionLoading] = useState(false);
  const [showSignOffForm, setShowSignOffForm] = useState(false);
  const [signOffNotesInput, setSignOffNotesInput] = useState("");

  // Delay form state
  const [showDelayForm, setShowDelayForm] = useState(false);
  const [delayDays, setDelayDays] = useState(1);
  const [delayReasonType, setDelayReasonType] = useState<"WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER">("OTHER");
  const [delayReasonText, setDelayReasonText] = useState("");
  const [delayLoading, setDelayLoading] = useState(false);
  const [delaySuggestion, setDelaySuggestion] = useState<{ rainDays: number; temperatureDays: number; suggestedReason: string | null } | null>(null);

  // Early-start programme impact dialog
  const [earlyStartDialog, setEarlyStartDialog] = useState<{
    jobId: string;
    jobName: string;
    daysEarly: number;
    endDate: string | null;
    isChild: boolean;
  } | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);

  // Pre-start checks (dependency + delivery warnings)
  const [preStartChecks, setPreStartChecks] = useState<{
    jobId: string;
    jobName: string;
    isChild: boolean;
    prevJob: { id: string; name: string } | null;
    undeliveredOrders: Array<{ id: string; supplier: string }>;
    signOffPrev: boolean;
    markDelivered: boolean;
  } | null>(null);
  const [preStartLoading, setPreStartLoading] = useState(false);

  // Post-completion programme shift dialog
  const [completionShiftDialog, setCompletionShiftDialog] = useState<{
    jobId: string;
    daysDeviation: number; // positive = finished early, negative = finished late
    nextJob: { id: string; name: string } | null;
    plotId: string;
  } | null>(null);

  // Child job summaries for synthetic parent panels
  const [childJobs, setChildJobs] = useState<Array<{ id: string; name: string; status: string; sortOrder: number; startDate: string | null; endDate: string | null; contractor: { id: string; name: string; company: string | null } | null }>>([]);
  const [childJobStatuses, setChildJobStatuses] = useState<Map<string, string>>(new Map());
  const [childJobActionLoading, setChildJobActionLoading] = useState<Set<string>>(new Set());
  const [childJobSignOff, setChildJobSignOff] = useState<string | null>(null);
  const [childSignOffNotes, setChildSignOffNotes] = useState("");

  // Fetch job data when panel opens
  useEffect(() => {
    if (!open || !context) {
      setPhotos([]);
      setActions([]);
      setOrders([]);
      setNoteText("");
      setLightboxIndex(null);
      setSnagPromptPhotos(null);
      setLocalStatus(null);
      setShowSignOffForm(false);
      setSignOffNotesInput("");
      setChildJobs([]);
      setChildJobStatuses(new Map());
      setChildJobActionLoading(new Set());
      setChildJobSignOff(null);
      setChildSignOffNotes("");
      setEarlyStartDialog(null);
      return;
    }

    const synthetic = context.job.id.startsWith("synth-");

    // For synthetic parent rows, fetch aggregated data from all child jobs
    if (synthetic) {
      const childIds = context.childJobIds ?? [];
      if (childIds.length === 0) {
        setOrders(context.job.orders ?? []);
        setPhotos([]);
        setActions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      Promise.all(
        childIds.map((cid) =>
          Promise.all([
            fetch(`/api/jobs/${cid}/photos`, { cache: "no-store" }).then((r) => r.json()),
            fetch(`/api/jobs/${cid}`, { cache: "no-store" }).then((r) => r.json()),
          ])
        )
      )
        .then((results) => {
          const allPhotos: JobPhoto[] = [];
          const allActions: JobAction[] = [];
          const allOrders: PanelOrder[] = [];
          for (const [photosData, jobData] of results) {
            if (Array.isArray(photosData)) allPhotos.push(...photosData);
            if (Array.isArray(jobData.actions)) {
              const tagged = jobData.actions.map((a: JobAction) => ({ ...a, jobName: jobData.name }));
              allActions.push(...tagged);
            }
            if (Array.isArray(jobData.orders)) allOrders.push(...jobData.orders);
          }
          allActions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          allPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setPhotos(allPhotos);
          setActions(allActions);
          setOrders(allOrders);
          // Aggregate unique contractors from all child jobs
          const contractorMap = new Map<string, { id: string; name: string; company: string | null }>();
          for (const [, jobData] of results) {
            if (Array.isArray(jobData.contractors)) {
              for (const jc of jobData.contractors) {
                if (jc.contact) contractorMap.set(jc.contact.id, jc.contact);
              }
            }
          }
          setPanelContractors(Array.from(contractorMap.values()));
          // Store child job summaries for per-job action buttons
          const summaries = childIds.map((cid, i) => {
            const jobData = results[i][1];
            const firstContractor = Array.isArray(jobData.contractors) && jobData.contractors.length > 0
              ? (jobData.contractors[0].contact ?? null)
              : null;
            return {
              id: cid,
              name: jobData.name ?? "Job",
              status: jobData.status ?? "NOT_STARTED",
              sortOrder: jobData.sortOrder ?? 0,
              startDate: jobData.startDate ?? null,
              endDate: jobData.endDate ?? null,
              contractor: firstContractor,
            };
          });
          setChildJobs(summaries);
          // Seed per-child contractor map
          const childContractorMap = new Map<string, { id: string; name: string; company: string | null } | null>();
          summaries.forEach((s) => childContractorMap.set(s.id, s.contractor));
          setChildJobContractors(childContractorMap);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    Promise.all([
      fetch(`/api/jobs/${context.job.id}/photos`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/jobs/${context.job.id}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([photosData, jobData]) => {
        setPhotos(Array.isArray(photosData) ? photosData : []);
        setActions(Array.isArray(jobData.actions) ? jobData.actions : []);
        setOrders(Array.isArray(jobData.orders) ? jobData.orders : []);
        // Seed localStatus from the fresh API response so the badge is never stale
        if (jobData.status) setLocalStatus(jobData.status);
        // Extract contractors
        if (Array.isArray(jobData.contractors) && jobData.contractors.length > 0) {
          setJobContractorContactId(jobData.contractors[0].contact?.id || null);
          setPanelContractors(jobData.contractors.map((jc: { contact: { id: string; name: string; company: string | null } | null }) => jc.contact).filter(Boolean));
        } else {
          setJobContractorContactId(null);
          setPanelContractors([]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, context]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i !== null && i > 0 ? i - 1 : photos.length - 1
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((i) =>
          i !== null && i < photos.length - 1 ? i + 1 : 0
        );
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length]);

  // Open contractor picker — optionally targeting a specific child job
  const openContractorPicker = useCallback(async (childJobId?: string) => {
    const res = await fetch("/api/contacts?type=CONTRACTOR");
    const data = await res.json();
    setAllContractors(Array.isArray(data) ? data.map((c: { id: string; name: string; company: string | null }) => ({ id: c.id, name: c.name, company: c.company })) : []);
    if (childJobId) {
      const existing = childJobContractors.get(childJobId);
      setSelectedContractorIds(existing ? new Set([existing.id]) : new Set());
      setContractorPickerTargetJobId(childJobId);
    } else {
      setSelectedContractorIds(new Set(panelContractors.map((c) => c.id)));
      setContractorPickerTargetJobId(null);
    }
    setContractorPickerOpen(true);
  }, [panelContractors, childJobContractors]);

  const saveContractors = useCallback(async () => {
    if (!context) return;
    const targetJobId = contractorPickerTargetJobId ?? (isSynthetic ? null : context.job.id);
    if (!targetJobId) return;
    setSavingContractors(true);
    try {
      const res = await fetch(`/api/jobs/${targetJobId}/contractors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selectedContractorIds) }),
      });
      if (res.ok) {
        const updated = await res.json();
        const contacts = updated.map((jc: { contact: { id: string; name: string; company: string | null } | null }) => jc.contact).filter(Boolean);
        if (contractorPickerTargetJobId) {
          // Update per-child contractor map
          const contractor = contacts[0] ?? null;
          setChildJobContractors((prev) => new Map(prev).set(contractorPickerTargetJobId, contractor));
        } else {
          setPanelContractors(contacts);
          setJobContractorContactId(contacts[0]?.id || null);
        }
      }
    } finally {
      setSavingContractors(false);
      setContractorPickerOpen(false);
      setContractorPickerTargetJobId(null);
    }
  }, [context, isSynthetic, contractorPickerTargetJobId, selectedContractorIds]);

  const handleAddNote = useCallback(async () => {
    if (!context || !noteText.trim()) return;

    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/jobs/${context.job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: noteText.trim() }),
      });

      if (res.ok) {
        const jobData = await fetch(`/api/jobs/${context.job.id}`, { cache: "no-store" }).then((r) =>
          r.json()
        );
        setActions(Array.isArray(jobData.actions) ? jobData.actions : []);
        setNoteText("");
      }
    } catch (error) {
      console.error("Failed to add note:", error);
    } finally {
      setSubmittingNote(false);
    }
  }, [context, noteText]);

  // Fire the actual start/stop/complete API call (shared by direct and post-dialog paths)
  const fireJobAction = useCallback(async (jobId: string, action: "start" | "stop" | "complete", notes?: string) => {
    const res = await fetch(`/api/jobs/${jobId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(notes ? { signOffNotes: notes } : {}) }),
    });
    if (res.ok) {
      const responseData = await res.json();
      const jobData = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).then((r) => r.json());
      setActions(Array.isArray(jobData.actions) ? jobData.actions : []);
      onJobUpdated?.();
      // After completing, offer programme adjustment if job deviated from schedule
      if (action === "complete" && responseData._completionContext) {
        const ctx = responseData._completionContext;
        if (ctx.daysDeviation !== 0) {
          setCompletionShiftDialog({
            jobId,
            daysDeviation: ctx.daysDeviation,
            nextJob: ctx.nextJob ?? null,
            plotId: ctx.plotId,
          });
        }
      }
    }
    return res.ok;
  }, [onJobUpdated]);

  // Job status actions (start / stop / sign off)
  const handleJobAction = useCallback(async (action: "start" | "stop" | "complete", notes?: string) => {
    if (!context || isSynthetic) return;
    const jobId = context.job.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (action === "start") {
      // Check for incomplete predecessor job on this plot
      let prevJob: { id: string; name: string } | null = null;
      try {
        const siblingsRes = await fetch(`/api/jobs/${jobId}/siblings`);
        if (siblingsRes.ok) {
          const { siblings } = await siblingsRes.json();
          const current = siblings.find((s: { id: string }) => s.id === jobId);
          if (current) {
            const prev = [...siblings]
              .filter((s: { sortOrder: number; status: string }) => s.sortOrder < current.sortOrder && s.status !== "COMPLETED")
              .sort((a: { sortOrder: number }, b: { sortOrder: number }) => b.sortOrder - a.sortOrder)[0] ?? null;
            if (prev) prevJob = { id: prev.id, name: prev.name };
          }
        }
      } catch { /* non-critical */ }

      const undelivered = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");

      if (prevJob || undelivered.length > 0) {
        setPreStartChecks({
          jobId, jobName: context.job.name, isChild: false,
          prevJob,
          undeliveredOrders: undelivered.map((o) => ({ id: o.id, supplier: o.supplier.name })),
          signOffPrev: false, markDelivered: false,
        });
        return;
      }

      // Early start: intercept and show programme impact dialog
      if (context.job.startDate) {
        const planned = new Date(context.job.startDate);
        planned.setHours(0, 0, 0, 0);
        const daysEarly = differenceInCalendarDays(planned, today);
        if (daysEarly > 0) {
          setEarlyStartDialog({ jobId, jobName: context.job.name, daysEarly, endDate: context.job.endDate ?? null, isChild: false });
          return;
        }
      }
    }

    setJobActionLoading(true);
    try {
      const ok = await fireJobAction(jobId, action, notes);
      if (ok) {
        if (action === "start") setLocalStatus("IN_PROGRESS");
        if (action === "stop") setLocalStatus("ON_HOLD");
        if (action === "complete") setLocalStatus("COMPLETED");
        setShowSignOffForm(false);
        setSignOffNotesInput("");
      }
    } catch (e) {
      console.error("Job action failed:", e);
    } finally {
      setJobActionLoading(false);
    }
  }, [context, isSynthetic, orders, fireJobAction]);

  // Action on an individual child job inside a synthetic parent panel
  const handleChildJobAction = useCallback(async (childId: string, action: "start" | "stop" | "complete", notes?: string) => {
    if (action === "start") {
      const child = childJobs.find((c) => c.id === childId);
      // Check for incomplete predecessor among siblings (other children with lower sortOrder)
      const prevIncompleteChild = child
        ? childJobs
            .filter((c) => c.sortOrder < child.sortOrder && (childJobStatuses.get(c.id) ?? c.status) !== "COMPLETED")
            .sort((a, b) => b.sortOrder - a.sortOrder)[0] ?? null
        : null;
      if (prevIncompleteChild) {
        setPreStartChecks({
          jobId: childId, jobName: child?.name ?? "", isChild: true,
          prevJob: { id: prevIncompleteChild.id, name: prevIncompleteChild.name },
          undeliveredOrders: [], signOffPrev: false, markDelivered: false,
        });
        return;
      }
      // Early start intercept for child jobs
      if (child?.startDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const planned = new Date(child.startDate); planned.setHours(0, 0, 0, 0);
        const daysEarly = differenceInCalendarDays(planned, today);
        if (daysEarly > 0) {
          setEarlyStartDialog({ jobId: childId, jobName: child.name, daysEarly, endDate: child.endDate, isChild: true });
          return;
        }
      }
    }

    setChildJobActionLoading((prev) => new Set(prev).add(childId));
    try {
      const ok = await fireJobAction(childId, action, notes);
      if (ok) {
        const newStatus = action === "start" ? "IN_PROGRESS" : action === "stop" ? "ON_HOLD" : "COMPLETED";
        setChildJobStatuses((prev) => new Map(prev).set(childId, newStatus));
        setChildJobSignOff(null);
        setChildSignOffNotes("");
        const jobData = await fetch(`/api/jobs/${childId}`, { cache: "no-store" }).then((r) => r.json());
        if (Array.isArray(jobData.actions)) {
          const tagged = jobData.actions.map((a: JobAction) => ({ ...a, jobName: jobData.name }));
          setActions((prev) => {
            const withoutChild = prev.filter((a) => !tagged.find((t: JobAction) => t.id === a.id));
            return [...tagged, ...withoutChild].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
      }
    } catch (e) {
      console.error("Child job action failed:", e);
    } finally {
      setChildJobActionLoading((prev) => { const s = new Set(prev); s.delete(childId); return s; });
    }
  }, [childJobs, fireJobAction]);

  // Handle "Pull Forward" — cascade all subsequent jobs earlier, then start
  const handlePullForward = useCallback(async () => {
    if (!earlyStartDialog) return;
    const { jobId, daysEarly, endDate, isChild } = earlyStartDialog;
    setCascadeLoading(true);
    try {
      if (endDate) {
        const newEnd = addDays(new Date(endDate), -daysEarly).toISOString().split("T")[0];
        await fetch(`/api/jobs/${jobId}/cascade`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
        });
      }
      await fireJobAction(jobId, "start");
      setEarlyStartDialog(null);
      if (isChild) {
        setChildJobStatuses((prev) => new Map(prev).set(jobId, "IN_PROGRESS"));
      } else {
        setLocalStatus("IN_PROGRESS");
      }
    } catch (e) {
      console.error("Pull forward failed:", e);
    } finally {
      setCascadeLoading(false);
    }
  }, [earlyStartDialog, fireJobAction]);

  // Handle "Expand Job" — just start, keep end date (more calendar time for this job)
  const handleExpandJob = useCallback(async () => {
    if (!earlyStartDialog) return;
    const { jobId, isChild } = earlyStartDialog;
    setCascadeLoading(true);
    try {
      await fireJobAction(jobId, "start");
      setEarlyStartDialog(null);
      if (isChild) {
        setChildJobStatuses((prev) => new Map(prev).set(jobId, "IN_PROGRESS"));
      } else {
        setLocalStatus("IN_PROGRESS");
      }
    } catch (e) {
      console.error("Expand job failed:", e);
    } finally {
      setCascadeLoading(false);
    }
  }, [earlyStartDialog, fireJobAction]);

  // Pre-start: resolve dependency/delivery warnings then proceed
  const handlePreStartConfirm = useCallback(async () => {
    if (!preStartChecks) return;
    const { jobId, jobName, isChild, prevJob, undeliveredOrders, signOffPrev, markDelivered } = preStartChecks;
    setPreStartChecks(null);
    setPreStartLoading(true);
    try {
      if (signOffPrev && prevJob) {
        await fetch(`/api/jobs/${prevJob.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete" }),
        });
        onJobUpdated?.();
      }
      if (markDelivered && undeliveredOrders.length > 0) {
        await Promise.all(
          undeliveredOrders.map((o) =>
            fetch(`/api/orders/${o.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "DELIVERED" }),
            })
          )
        );
        setOrders((prev) =>
          prev.map((o) => (undeliveredOrders.find((u) => u.id === o.id) ? { ...o, status: "DELIVERED" } : o))
        );
      }
      // Check for early start
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const jobRef = isChild ? childJobs.find((c) => c.id === jobId) : context?.job;
      if (jobRef?.startDate) {
        const planned = new Date(jobRef.startDate); planned.setHours(0, 0, 0, 0);
        const daysEarly = differenceInCalendarDays(planned, today);
        if (daysEarly > 0) {
          setEarlyStartDialog({ jobId, jobName, daysEarly, endDate: jobRef.endDate ?? null, isChild });
          return;
        }
      }
      // Fire start
      if (!isChild) {
        setJobActionLoading(true);
        const ok = await fireJobAction(jobId, "start");
        if (ok) setLocalStatus("IN_PROGRESS");
        setJobActionLoading(false);
      } else {
        setChildJobActionLoading((prev) => new Set(prev).add(jobId));
        const ok = await fireJobAction(jobId, "start");
        if (ok) setChildJobStatuses((prev) => new Map(prev).set(jobId, "IN_PROGRESS"));
        setChildJobActionLoading((prev) => { const s = new Set(prev); s.delete(jobId); return s; });
      }
    } catch (e) {
      console.error("Pre-start confirm failed:", e);
    } finally {
      setPreStartLoading(false);
    }
  }, [preStartChecks, context, childJobs, fireJobAction, onJobUpdated]);

  // Post-completion: shift entire programme from the actual end date
  const handleShiftProgramme = useCallback(async () => {
    if (!completionShiftDialog) return;
    setCascadeLoading(true);
    try {
      const jobData = await fetch(`/api/jobs/${completionShiftDialog.jobId}`, { cache: "no-store" }).then((r) => r.json());
      const actualEnd: string | null = jobData.actualEndDate ?? null;
      if (actualEnd) {
        await fetch(`/api/jobs/${completionShiftDialog.jobId}/cascade`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate: actualEnd.slice(0, 10), confirm: true }),
        });
        onJobUpdated?.();
      }
    } catch (e) {
      console.error("Shift programme failed:", e);
    } finally {
      setCascadeLoading(false);
      setCompletionShiftDialog(null);
    }
  }, [completionShiftDialog, onJobUpdated]);

  // Post-completion: adjust next job only (shift its start + end by same delta)
  const handleAdjustNextJob = useCallback(async () => {
    if (!completionShiftDialog?.nextJob) return;
    setCascadeLoading(true);
    try {
      const { daysDeviation, nextJob } = completionShiftDialog;
      // daysDeviation positive = early (actual before plan) → pull next job forward
      // daysDeviation negative = late (actual after plan) → push next job back
      const delta = -daysDeviation;
      const nextJobData = await fetch(`/api/jobs/${nextJob.id}`, { cache: "no-store" }).then((r) => r.json());
      const updates: Record<string, string> = {};
      if (nextJobData.endDate) updates.endDate = addDays(new Date(nextJobData.endDate), delta).toISOString().slice(0, 10);
      if (nextJobData.startDate) updates.startDate = addDays(new Date(nextJobData.startDate), delta).toISOString().slice(0, 10);
      if (Object.keys(updates).length > 0) {
        await fetch(`/api/jobs/${nextJob.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        onJobUpdated?.();
      }
    } catch (e) {
      console.error("Adjust next job failed:", e);
    } finally {
      setCascadeLoading(false);
      setCompletionShiftDialog(null);
    }
  }, [completionShiftDialog, onJobUpdated]);

  // Open delay form — fetch weather suggestion at the same time
  const openDelayForm = useCallback(async () => {
    if (!context || isSynthetic) return;
    setShowDelayForm(true);
    setDelayDays(1);
    setDelayReasonType("OTHER");
    setDelayReasonText("");
    try {
      const res = await fetch(`/api/jobs/${context.job.id}/delay`);
      if (res.ok) {
        const data = await res.json();
        setDelaySuggestion(data);
        if (data.suggestedReason) setDelayReasonType(data.suggestedReason);
      }
    } catch { /* non-critical */ }
  }, [context, isSynthetic]);

  const handleDelay = useCallback(async () => {
    if (!context || isSynthetic) return;
    setDelayLoading(true);
    try {
      const res = await fetch(`/api/jobs/${context.job.id}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: delayDays,
          delayReasonType,
          reason: delayReasonText.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowDelayForm(false);
      onJobUpdated?.();
    } catch (e) {
      console.error("Delay failed:", e);
    } finally {
      setDelayLoading(false);
    }
  }, [context, isSynthetic, delayDays, delayReasonType, delayReasonText, onJobUpdated]);

  // Stage files for upload (shows caption input)
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingFiles(files);
    setPhotoCaption("");
  }, []);

  // Upload staged photos with optional caption
  const handleUpload = useCallback(async () => {
    if (!pendingFiles || pendingFiles.length === 0 || !context) return;

    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(pendingFiles).forEach((file) => formData.append("photos", file));
      if (photoCaption.trim()) {
        formData.append("caption", photoCaption.trim());
      }

      const res = await fetch(`/api/jobs/${context.job.id}/photos`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const newPhotos: JobPhoto[] = await res.json();
        setPhotos((prev) => [...newPhotos, ...prev]);
        // Refetch actions to pick up the auto-generated "photo uploaded" note
        try {
          const jobData = await fetch(`/api/jobs/${context.job.id}`, { cache: "no-store" }).then((r) => r.json());
          if (Array.isArray(jobData.actions)) setActions(jobData.actions);
        } catch { /* ignore */ }

        // Show "Raise as snag?" prompt
        if (newPhotos.length > 0) {
          setSnagPromptPhotos(newPhotos);
        }
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
      setPendingFiles(null);
      setPhotoCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }, [context, pendingFiles, photoCaption]);

  // Open snag dialog (called from SnagDialog's onSaved)
  const handleSnagSaved = useCallback(() => {
    setSnagPhotoAttachments([]);
    setSnagPromptPhotos(null);
  }, []);

  // Open full order detail sheet
  const handleOpenOrderDetail = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSelectedOrderDetail(data);
      }
    } catch (err) {
      console.error("Failed to fetch order:", err);
    }
  }, []);

  // Update order status (Mark Sent / Confirm Delivery)
  const handleOrderAction = useCallback(
    async (orderId: string, newStatus: string) => {
      setActioningIds((prev) => new Set(prev).add(orderId));
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
          );
          onOrderUpdated?.();
        }
      } catch (err) {
        console.error("Failed to update order:", err);
      } finally {
        setActioningIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [onOrderUpdated]
  );

  // Delete photo
  const handleDeletePhoto = useCallback(
    async (photoId: string) => {
      if (!context) return;
      setDeletingId(photoId);
      try {
        const res = await fetch(
          `/api/jobs/${context.job.id}/photos?photoId=${photoId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setPhotos((prev) => prev.filter((p) => p.id !== photoId));
          // Close lightbox if we deleted the current photo
          if (lightboxIndex !== null) {
            setLightboxIndex(null);
          }
        }
      } catch (error) {
        console.error("Delete failed:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [context, lightboxIndex]
  );

  // Update photo caption
  const handleSaveCaption = useCallback(
    async (photoId: string, newCaption: string) => {
      if (!context) return;
      setSavingCaption(true);
      try {
        const res = await fetch(`/api/jobs/${context.job.id}/photos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, caption: newCaption || null }),
        });
        if (res.ok) {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photoId ? { ...p, caption: newCaption || null } : p
            )
          );
          setEditingCaption(false);
        }
      } catch (error) {
        console.error("Caption update failed:", error);
      } finally {
        setSavingCaption(false);
      }
    },
    [context]
  );

  // Raise snag from lightbox photo
  const handleRaiseSnagFromPhoto = useCallback(
    (photo: JobPhoto) => {
      setLightboxIndex(null);
      setSnagPhotoAttachments([{ url: photo.url, fileName: photo.fileName || "photo.jpg" }]);
      setSnagDialogOpen(true);
    },
    []
  );

  // Handle "Raise as Snag?" prompt from upload
  const handleSnagPromptYes = useCallback(() => {
    if (!snagPromptPhotos) return;
    setSnagPhotoAttachments(
      snagPromptPhotos.map((p) => ({ url: p.url, fileName: p.fileName || "photo.jpg" }))
    );
    setSnagPromptPhotos(null);
    setSnagDialogOpen(true);
  }, [snagPromptPhotos]);

  if (!context) return null;

  const { job, plotName, plotId, siteName, siteId } = context;
  const effectiveStatus = localStatus ?? job.status;
  const stageCode = getStageCode(job);
  const stageColors = getStageColor(job.status);
  const statusConfig = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.NOT_STARTED;
  const lightboxPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded text-xs font-bold"
                style={{
                  backgroundColor: stageColors.bg,
                  color: stageColors.text,
                }}
              >
                {stageCode}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate">{job.name}</DialogTitle>
                <DialogDescription className="truncate">
                  <Link href={`/sites/${siteId}`} className="hover:underline">{siteName}</Link>
                  {" \u203a "}
                  <Link href={`/sites/${siteId}/plots/${plotId}`} className="hover:underline">{plotName}</Link>
                </DialogDescription>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.className}`}
              >
                {statusConfig.label}
              </span>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5 pt-1">
              {/* Info */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {(job.startDate || job.endDate) && (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    <span>
                      {job.startDate
                        ? format(new Date(job.startDate), "d MMM")
                        : "?"}
                      {" \u2192 "}
                      {job.endDate
                        ? format(new Date(job.endDate), "d MMM yyyy")
                        : "?"}
                    </span>
                  </div>
                )}
              </div>

              {/* Sub-job action buttons — shown inside synthetic parent panels */}
              {isSynthetic && childJobs.length > 0 && (() => {
                const sorted = [...childJobs].sort((a, b) => a.sortOrder - b.sortOrder);
                const liveJobs = sorted.filter((j) => (childJobStatuses.get(j.id) ?? j.status) === "IN_PROGRESS");
                const nextJob = sorted.find((j) => {
                  const s = childJobStatuses.get(j.id) ?? j.status;
                  return s === "NOT_STARTED" || s === "ON_HOLD";
                });
                const visibleJobs = [...liveJobs, ...(nextJob && !liveJobs.find((j) => j.id === nextJob.id) ? [nextJob] : [])];
                if (visibleJobs.length === 0) return null;
                return (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {liveJobs.length > 0 ? "Live & Next" : "Next Up"}
                  </p>
                  {visibleJobs.map((child) => {
                    const childStatus = childJobStatuses.get(child.id) ?? child.status;
                    const childLoading = childJobActionLoading.has(child.id);
                    const childStatusCfg = STATUS_CONFIG[childStatus] ?? STATUS_CONFIG.NOT_STARTED;
                    const isSigningOff = childJobSignOff === child.id;
                    const childContractor = childJobContractors.get(child.id) ?? null;
                    return (
                      <div key={child.id} className="rounded-lg border bg-slate-50 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{child.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${childStatusCfg.className}`}>
                            {childStatusCfg.label}
                          </span>
                        </div>
                        {(child.startDate || child.endDate) && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarDays className="size-3 shrink-0" />
                            {child.startDate ? format(new Date(child.startDate), "d MMM") : "?"}
                            {" → "}
                            {child.endDate ? format(new Date(child.endDate), "d MMM") : "?"}
                          </p>
                        )}
                        {/* Per-sub-job contractor badge + edit */}
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition-colors"
                          onClick={() => openContractorPicker(child.id)}
                          title="Assign contractor"
                        >
                          <HardHat className="size-3 shrink-0" />
                          {childContractor
                            ? (childContractor.company || childContractor.name)
                            : <span className="text-slate-400">No contractor</span>
                          }
                        </button>
                        {!isSigningOff && (childStatus === "NOT_STARTED" || childStatus === "ON_HOLD") && (
                          <Button
                            size="sm"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={childLoading}
                            onClick={() => handleChildJobAction(child.id, "start")}
                          >
                            {childLoading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Play className="size-3.5 mr-1" />}
                            Start
                          </Button>
                        )}
                        {!isSigningOff && childStatus === "IN_PROGRESS" && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                              disabled={childLoading}
                              onClick={() => handleChildJobAction(child.id, "stop")}
                            >
                              {childLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Pause className="size-3.5" />}
                              <span className="ml-1">Pause</span>
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => { setChildJobSignOff(child.id); setChildSignOffNotes(""); }}
                            >
                              <ShieldCheck className="size-3.5 mr-1" />
                              Sign Off
                            </Button>
                          </div>
                        )}
                        {isSigningOff && (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Sign-off notes (optional)..."
                              value={childSignOffNotes}
                              onChange={(e) => setChildSignOffNotes(e.target.value)}
                              rows={2}
                              className="text-xs bg-white"
                            />
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setChildJobSignOff(null)}>
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={childLoading}
                                onClick={() => handleChildJobAction(child.id, "complete", childSignOffNotes.trim() || undefined)}
                              >
                                {childLoading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                                Confirm
                              </Button>
                            </div>
                          </div>
                        )}
                        {childStatus === "COMPLETED" && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CircleCheck className="size-3.5" /> Signed off
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })()}

              {/* Job Action Buttons — not shown for synthetic aggregate views */}
              {!isSynthetic && (
                <div className="space-y-2">
                  {(effectiveStatus === "NOT_STARTED" || effectiveStatus === "ON_HOLD") && (
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={jobActionLoading}
                      onClick={() => handleJobAction("start")}
                    >
                      {jobActionLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Play className="size-4 mr-2" />}
                      Start Job
                    </Button>
                  )}
                  {effectiveStatus === "IN_PROGRESS" && !showSignOffForm && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                        disabled={jobActionLoading}
                        onClick={() => handleJobAction("stop")}
                      >
                        {jobActionLoading ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
                        <span className="ml-1">Pause</span>
                      </Button>
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setShowSignOffForm(true)}
                      >
                        <ShieldCheck className="size-4 mr-1" />
                        Sign Off
                      </Button>
                    </div>
                  )}
                  {showSignOffForm && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-emerald-800">Sign-off notes (optional)</p>
                      <Textarea
                        placeholder="Work completed, handover notes..."
                        value={signOffNotesInput}
                        onChange={(e) => setSignOffNotesInput(e.target.value)}
                        rows={2}
                        className="text-sm bg-white"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowSignOffForm(false)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={jobActionLoading}
                          onClick={() => handleJobAction("complete", signOffNotesInput.trim() || undefined)}
                        >
                          {jobActionLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : <ShieldCheck className="size-4 mr-1" />}
                          Confirm
                        </Button>
                      </div>
                    </div>
                  )}
                  {effectiveStatus === "COMPLETED" && (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
                      <CircleCheck className="size-4" />
                      Signed Off
                    </div>
                  )}

                  {/* Delay button — available for any non-completed job */}
                  {effectiveStatus !== "COMPLETED" && !showDelayForm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={openDelayForm}
                    >
                      <Clock className="size-3.5 mr-1.5" />
                      Delay Job
                    </Button>
                  )}

                  {/* Inline delay form */}
                  {showDelayForm && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-amber-800">Delay this job</p>

                      {/* Weather suggestion */}
                      {delaySuggestion && (delaySuggestion.rainDays > 0 || delaySuggestion.temperatureDays > 0) && (
                        <div className="rounded bg-white px-2 py-1.5 text-[11px] text-amber-700 border border-amber-200">
                          {delaySuggestion.rainDays > 0 && <span>☔ {delaySuggestion.rainDays} rain day{delaySuggestion.rainDays !== 1 ? "s" : ""}</span>}
                          {delaySuggestion.rainDays > 0 && delaySuggestion.temperatureDays > 0 && <span> · </span>}
                          {delaySuggestion.temperatureDays > 0 && <span>🌡️ {delaySuggestion.temperatureDays} temperature day{delaySuggestion.temperatureDays !== 1 ? "s" : ""}</span>}
                          <span className="ml-1 text-amber-600">logged on this job&apos;s period</span>
                        </div>
                      )}

                      {/* Days */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 shrink-0">Days:</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={delayDays}
                          onChange={(e) => setDelayDays(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>

                      {/* Reason type */}
                      <div className="flex gap-1">
                        {(["WEATHER_RAIN", "WEATHER_TEMPERATURE", "OTHER"] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setDelayReasonType(r)}
                            className={`flex-1 rounded px-1 py-1 text-[10px] font-medium transition-colors ${
                              delayReasonType === r
                                ? r === "WEATHER_RAIN" ? "bg-orange-500 text-white"
                                  : r === "WEATHER_TEMPERATURE" ? "bg-cyan-500 text-white"
                                  : "bg-slate-700 text-white"
                                : "border bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {r === "WEATHER_RAIN" ? "☔ Rain" : r === "WEATHER_TEMPERATURE" ? "🌡️ Temp" : "⏳ Other"}
                          </button>
                        ))}
                      </div>

                      {delayReasonType === "OTHER" && (
                        <input
                          type="text"
                          value={delayReasonText}
                          onChange={(e) => setDelayReasonText(e.target.value)}
                          placeholder="Reason (optional)..."
                          className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      )}

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDelayForm(false)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                          disabled={delayLoading}
                          onClick={handleDelay}
                        >
                          {delayLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Clock className="size-3 mr-1" />}
                          Delay {delayDays}d
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Contractor row */}
              <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <HardHat className="size-4 shrink-0 text-muted-foreground" />
                  {panelContractors.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No contractor assigned</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {panelContractors.map((c) => (
                        <span key={c.id} className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {c.company || c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {!isSynthetic && (
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={() => openContractorPicker()}>
                    <Pencil className="size-3" />
                    {panelContractors.length === 0 ? "Assign" : "Change"}
                  </Button>
                )}
              </div>

              {/* Orders & Deliveries Section */}
              {orders.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Truck className="size-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Orders & Deliveries</h4>
                    <span className="text-xs text-muted-foreground">
                      ({orders.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {orders.map((order) => {
                      const isActioning = actioningIds.has(order.id);
                      const statusColors: Record<string, string> = {
                        PENDING: "bg-slate-100 text-slate-600",
                        ORDERED: "bg-blue-100 text-blue-700",
                        CONFIRMED: "bg-amber-100 text-amber-700",
                        DELIVERED: "bg-green-100 text-green-700",
                        CANCELLED: "bg-red-100 text-red-700",
                      };
                      return (
                        <div
                          key={order.id}
                          className="rounded-lg border p-2.5 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => handleOpenOrderDetail(order.id)} className="font-medium truncate text-blue-600 hover:underline text-left">
                              {order.supplier.name}
                            </button>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                statusColors[order.status] || statusColors.PENDING
                              }`}
                            >
                              {order.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          {order.orderItems && order.orderItems.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground truncate">
                              {order.orderItems
                                .map((i) => `${i.quantity}x ${i.description || "item"}`)
                                .join(", ")}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <ShoppingCart className="size-2.5" />
                                {format(new Date(order.dateOfOrder), "d MMM")}
                              </span>
                              {order.expectedDeliveryDate && (
                                <span className="flex items-center gap-1">
                                  <Truck className="size-2.5" />
                                  {format(
                                    new Date(order.expectedDeliveryDate),
                                    "d MMM"
                                  )}
                                </span>
                              )}
                              {order.leadTimeDays != null && (
                                <span className="text-muted-foreground/70">
                                  {order.leadTimeDays}d
                                </span>
                              )}
                            </div>
                            {/* Action buttons based on status */}
                            <div className="flex items-center gap-1">
                              {order.status === "PENDING" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                                  disabled={isActioning}
                                  onClick={() => handleOrderAction(order.id, "ORDERED")}
                                >
                                  {isActioning ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Send className="size-3" />
                                  )}
                                  Mark Sent
                                </Button>
                              )}
                              {(order.status === "ORDERED" || order.status === "CONFIRMED") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] border-green-300 text-green-700 hover:bg-green-50"
                                  disabled={isActioning}
                                  onClick={() => handleOrderAction(order.id, "DELIVERED")}
                                >
                                  {isActioning ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <CircleCheck className="size-3" />
                                  )}
                                  Confirm Delivery
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes Section */}
              <NotesSection
                actions={actions}
                noteText={noteText}
                setNoteText={setNoteText}
                submittingNote={submittingNote}
                handleAddNote={handleAddNote}
                isSynthetic={isSynthetic}
              />

              {/* Photos Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Photos</h4>
                    <span className="text-xs text-muted-foreground">
                      ({photos.length})
                    </span>
                  </div>
                  {/* Upload buttons — only for real jobs, not synthetic parents */}
                  {!isSynthetic && (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploading}
                        className="h-7 text-xs"
                      >
                        <Camera className="size-3" />
                        Camera
                      </Button>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="h-7 text-xs"
                      >
                        <Upload className="size-3" />
                        Upload
                      </Button>
                    </div>
                  )}
                </div>

                {/* Caption input — shown after selecting files */}
                {pendingFiles && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {pendingFiles.length} photo{pendingFiles.length > 1 ? "s" : ""} selected
                    </p>
                    <Input
                      placeholder="Add a caption (optional)..."
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleUpload}
                        disabled={uploading}
                        className="h-7 text-xs"
                      >
                        {uploading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Upload className="size-3" />
                        )}
                        {uploading ? "Uploading..." : "Upload"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPendingFiles(null);
                          setPhotoCaption("");
                          if (fileInputRef.current) fileInputRef.current.value = "";
                          if (cameraInputRef.current) cameraInputRef.current.value = "";
                        }}
                        disabled={uploading}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* "Raise as Snag?" prompt after upload */}
                {snagPromptPhotos && !isSynthetic && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 flex items-center justify-between gap-2">
                    <p className="text-xs text-amber-800">
                      \ud83d\udcf7 Photo uploaded — Raise as a snag?
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100"
                        onClick={handleSnagPromptYes}
                      >
                        <AlertTriangle className="size-3" />
                        Yes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => setSnagPromptPhotos(null)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                )}

                {photos.length === 0 ? (
                  !isSynthetic ? (
                    <div className="flex flex-col items-center py-4 text-center">
                      <ImageIcon className="size-6 text-muted-foreground/40" />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        No photos yet — use the buttons above
                      </p>
                    </div>
                  ) : null
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer"
                        onClick={() => {
                          setLightboxIndex(idx);
                          setEditingCaption(false);
                        }}
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption || photo.fileName || "Job photo"}
                          className="size-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                          {photo.caption && (
                            <p className="truncate text-[9px] font-medium text-white">
                              {photo.caption}
                            </p>
                          )}
                          {photo.createdAt && (
                            <p className="truncate text-[9px] text-white/80">
                              {format(new Date(photo.createdAt), "d MMM HH:mm")}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Raise Snag — only for real jobs */}
              {!isSynthetic && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={() => setSnagDialogOpen(true)}
                >
                  <AlertTriangle className="size-3.5" />
                  Raise Snag
                </Button>
              )}

              {/* View Full Job Link */}
              <div className="border-t pt-3">
                {isSynthetic ? (
                  <Link
                    href={`/sites/${siteId}/plots/${plotId}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    View Plot
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : (
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    View Full Job
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox Dialog */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={() => {
          setLightboxIndex(null);
          setEditingCaption(false);
        }}
      >
        <DialogContent className="max-w-3xl p-0 overflow-hidden [&>button]:hidden">
          {lightboxPhoto && (
            <div>
              {/* Image area */}
              <div className="relative flex items-center justify-center bg-black min-h-[300px]">
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.caption || lightboxPhoto.fileName || "Photo"}
                  className="max-h-[70vh] w-auto object-contain"
                />

                {/* Close button */}
                <button
                  className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
                  onClick={() => {
                    setLightboxIndex(null);
                    setEditingCaption(false);
                  }}
                >
                  <X className="size-4" />
                </button>

                {/* Nav arrows */}
                {photos.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex((i) =>
                          i !== null && i > 0 ? i - 1 : photos.length - 1
                        );
                        setEditingCaption(false);
                      }}
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex((i) =>
                          i !== null && i < photos.length - 1 ? i + 1 : 0
                        );
                        setEditingCaption(false);
                      }}
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Footer with actions */}
              <div className="border-t p-3 space-y-2">
                {/* Caption row */}
                <div className="flex items-center gap-2">
                  {editingCaption ? (
                    <div className="flex flex-1 gap-2">
                      <Input
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Add a caption..."
                        className="h-7 text-xs flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveCaption(lightboxPhoto.id, captionDraft);
                          } else if (e.key === "Escape") {
                            setEditingCaption(false);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSaveCaption(lightboxPhoto.id, captionDraft)}
                        disabled={savingCaption}
                      >
                        {savingCaption ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditingCaption(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <p className="text-sm truncate flex-1">
                        {lightboxPhoto.caption || (
                          <span className="text-muted-foreground italic">No caption</span>
                        )}
                      </p>
                      {!isSynthetic && (
                        <button
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setCaptionDraft(lightboxPhoto.caption || "");
                            setEditingCaption(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Info + actions row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {lightboxPhoto.uploadedBy?.name || "Unknown"} &middot;{" "}
                      {format(new Date(lightboxPhoto.createdAt), "d MMM HH:mm")}
                    </span>
                    <span>
                      {lightboxIndex! + 1} / {photos.length}
                    </span>
                  </div>

                  {!isSynthetic && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => handleRaiseSnagFromPhoto(lightboxPhoto)}
                      >
                        <AlertTriangle className="size-3" />
                        Raise Snag
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-600"
                        onClick={() => handleDeletePhoto(lightboxPhoto.id)}
                        disabled={deletingId === lightboxPhoto.id}
                      >
                        {deletingId === lightboxPhoto.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Snag Dialog — full form with all fields */}
      {!isSynthetic && (
        <SnagDialog
          open={snagDialogOpen}
          onOpenChange={(o) => {
            setSnagDialogOpen(o);
            if (!o) setSnagPhotoAttachments([]);
          }}
          plotId={plotId}
          onSaved={handleSnagSaved}
          initialPhotos={snagPhotoAttachments.length > 0 ? snagPhotoAttachments : undefined}
          initialJobId={job.id}
          initialContactId={jobContractorContactId || undefined}
        />
      )}

      {/* Contractor Picker Dialog */}
      <Dialog open={contractorPickerOpen} onOpenChange={(o) => { if (!o) { setContractorPickerOpen(false); setContractorPickerTargetJobId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Contractor</DialogTitle>
            {contractorPickerTargetJobId && (
              <DialogDescription>{childJobs.find((c) => c.id === contractorPickerTargetJobId)?.name}</DialogDescription>
            )}
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto">
            {allContractors.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No contractors found</p>
            ) : (
              <div className="space-y-1">
                {allContractors.map((c) => {
                  const selected = selectedContractorIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContractorIds((prev) => {
                        const next = new Set(prev);
                        selected ? next.delete(c.id) : next.add(c.id);
                        return next;
                      })}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                        {selected && <Check className="size-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => { setContractorPickerOpen(false); setContractorPickerTargetJobId(null); }}>Cancel</Button>
            <Button size="sm" disabled={savingContractors} onClick={saveContractors}>
              {savingContractors && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Save ({selectedContractorIds.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrderDetail}
        open={!!selectedOrderDetail}
        onOpenChange={(o) => { if (!o) setSelectedOrderDetail(null); }}
        onUpdated={(updated) => {
          setSelectedOrderDetail(updated);
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o))
          );
          onOrderUpdated?.();
        }}
        onDeleted={(orderId) => {
          setSelectedOrderDetail(null);
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          onOrderUpdated?.();
        }}
        onEditClick={() => {
          // Close sheet — editing handled on orders page
          setSelectedOrderDetail(null);
        }}
      />

      {/* Pre-start checks: incomplete predecessor + undelivered orders */}
      <Dialog open={!!preStartChecks} onOpenChange={(o) => { if (!o) setPreStartChecks(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              Before You Start
            </DialogTitle>
            <DialogDescription>
              Review these items before starting{" "}
              <span className="font-medium">{preStartChecks?.jobName}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {preStartChecks?.prevJob && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={preStartChecks.signOffPrev}
                  onChange={() =>
                    setPreStartChecks((prev) => prev ? { ...prev, signOffPrev: !prev.signOffPrev } : prev)
                  }
                  className="mt-0.5 size-4 rounded"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">Previous job not signed off</p>
                  <p className="text-xs text-amber-600">
                    <span className="font-medium">{preStartChecks.prevJob.name}</span> is still in progress.
                    Tick to sign it off now.
                  </p>
                </div>
              </label>
            )}
            {preStartChecks && preStartChecks.undeliveredOrders.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <input
                  type="checkbox"
                  checked={preStartChecks.markDelivered}
                  onChange={() =>
                    setPreStartChecks((prev) => prev ? { ...prev, markDelivered: !prev.markDelivered } : prev)
                  }
                  className="mt-0.5 size-4 rounded"
                />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    {preStartChecks.undeliveredOrders.length} order
                    {preStartChecks.undeliveredOrders.length !== 1 ? "s" : ""} not yet delivered
                  </p>
                  <p className="text-xs text-blue-600">
                    {preStartChecks.undeliveredOrders.map((o) => o.supplier).join(", ")} — tick to mark as delivered.
                  </p>
                </div>
              </label>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPreStartChecks(null)}
                disabled={preStartLoading}
                className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePreStartConfirm}
                disabled={preStartLoading}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {preStartLoading ? <Loader2 className="inline size-3.5 animate-spin mr-1" /> : null}
                Start Anyway
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-completion: offer programme adjustment when there was deviation */}
      <Dialog open={!!completionShiftDialog} onOpenChange={(o) => { if (!o) setCompletionShiftDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Programme Impact</DialogTitle>
            <DialogDescription>
              {completionShiftDialog && <>
                This job finished{" "}
                <span className={`font-semibold ${completionShiftDialog.daysDeviation > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  {Math.abs(completionShiftDialog.daysDeviation)} day
                  {Math.abs(completionShiftDialog.daysDeviation) !== 1 ? "s" : ""}{" "}
                  {completionShiftDialog.daysDeviation > 0 ? "early" : "late"}
                </span>. How would you like to adjust the programme?
              </>}
            </DialogDescription>
          </DialogHeader>
          {completionShiftDialog && (
            <div className="space-y-2">
              <button
                onClick={handleShiftProgramme}
                disabled={cascadeLoading}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-100 transition-colors disabled:opacity-60"
              >
                <span className="mt-0.5 text-lg">⏩</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">Shift Entire Programme</p>
                  <p className="text-xs text-blue-600">
                    Move all remaining jobs {Math.abs(completionShiftDialog.daysDeviation)} day
                    {Math.abs(completionShiftDialog.daysDeviation) !== 1 ? "s" : ""}{" "}
                    {completionShiftDialog.daysDeviation > 0 ? "earlier" : "later"}.
                  </p>
                </div>
              </button>
              {completionShiftDialog.nextJob && (
                <button
                  onClick={handleAdjustNextJob}
                  disabled={cascadeLoading}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3.5 text-left hover:border-emerald-400 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                >
                  <span className="mt-0.5 text-lg">📋</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Adjust Next Job Only</p>
                    <p className="text-xs text-emerald-600">
                      Shift <span className="font-medium">{completionShiftDialog.nextJob.name}</span> dates only,
                      keeping the rest of the programme unchanged.
                    </p>
                  </div>
                </button>
              )}
              <button
                onClick={() => setCompletionShiftDialog(null)}
                disabled={cascadeLoading}
                className="w-full rounded-xl border border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50 transition-colors"
              >
                Keep As Is
              </button>
              {cascadeLoading && (
                <div className="flex items-center justify-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Updating programme…
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Early-start programme impact dialog */}
      <Dialog open={!!earlyStartDialog} onOpenChange={(o) => { if (!o) setEarlyStartDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Starting Early</DialogTitle>
            <DialogDescription>
              {earlyStartDialog && <>
                <span className="font-medium">{earlyStartDialog.jobName}</span> is planned to start in{" "}
                <span className="font-semibold text-blue-600">{earlyStartDialog.daysEarly} day{earlyStartDialog.daysEarly !== 1 ? "s" : ""}</span>.
                How would you like to handle the programme?
              </>}
            </DialogDescription>
          </DialogHeader>
          {earlyStartDialog && (
            <div className="space-y-2">
              <button
                onClick={handlePullForward}
                disabled={cascadeLoading}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-100 transition-colors disabled:opacity-60"
              >
                <span className="mt-0.5 text-lg">⏩</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">Pull Programme Forward</p>
                  <p className="text-xs text-blue-600">
                    Shift this job and all subsequent jobs {earlyStartDialog.daysEarly} day{earlyStartDialog.daysEarly !== 1 ? "s" : ""} earlier. Gantt updates automatically.
                  </p>
                </div>
              </button>
              <button
                onClick={handleExpandJob}
                disabled={cascadeLoading}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3.5 text-left hover:border-emerald-400 hover:bg-emerald-100 transition-colors disabled:opacity-60"
              >
                <span className="mt-0.5 text-lg">📐</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Expand This Job</p>
                  <p className="text-xs text-emerald-600">
                    Start now, keep the planned end date. The job gets more calendar time — rest of the programme stays put.
                  </p>
                </div>
              </button>
              <button
                onClick={() => setEarlyStartDialog(null)}
                disabled={cascadeLoading}
                className="w-full rounded-xl border border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              {cascadeLoading && (
                <div className="flex items-center justify-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Updating programme…
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
