"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import {
  ArrowLeft,
  Briefcase,
  Play,
  Pause,
  CheckCircle,
  MapPin,
  Calendar,
  User,
  Building2,
  LayoutGrid,
  ShoppingCart,
  Clock,
  Package,
  HardHat,
  UserPlus,
  X,
  Loader2,
  Mail,
  AlertTriangle,
  ArrowRight,
  Send,
  Pencil,
  Check,
  Bug,
  StickyNote,
  Activity,
} from "lucide-react";
import { JobSiblingNav } from "@/components/jobs/JobSiblingNav";
import { SnagDialog } from "@/components/snags/SnagDialog";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/shared/HelpTip";
import { PhotoUpload } from "./PhotoUpload";
import { useJobAction } from "@/hooks/useJobAction";
import { useDelayJob } from "@/hooks/useDelayJob";
import { usePullForwardDecision } from "@/hooks/usePullForwardDecision";
import { useAddNote } from "@/hooks/useAddNote";
import { useSnagAction, type SnagStatus } from "@/hooks/useSnagAction";
import { useOrderStatus, type OrderStatus } from "@/hooks/useOrderStatus";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { JobStatusBadge, OrderStatusBadge, SnagStatusBadge, SnagPriorityBadge } from "@/components/shared/StatusBadge";
import { useJobContractorPicker } from "@/hooks/useJobContractorPicker";

// ---------- Types ----------

interface JobDetail {
  id: string;
  name: string;
  description: string | null;
  plotId: string;
  location: string | null;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  plot: {
    id: string;
    name: string;
    description: string | null;
    siteId: string;
    createdAt: string;
    updatedAt: string;
    site: {
      id: string;
      name: string;
      description: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
      createdById: string;
    };
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  contractors: Array<{
    id: string;
    contactId: string;
    contact: {
      id: string;
      name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
    };
  }>;
  orders: Array<{
    id: string;
    supplierId: string;
    jobId: string | null;
    orderDetails: string | null;
    dateOfOrder: string;
    orderType: string | null;
    automated: boolean;
    status: string;
    expectedDeliveryDate: string | null;
    deliveredDate: string | null;
    leadTimeDays: number | null;
    itemsDescription: string | null;
    createdAt: string;
    updatedAt: string;
    supplier: { id: string; name: string };
    orderItems: Array<{
      id: string;
      name: string;
      quantity: number;
      unit: string;
      unitCost: number;
      totalCost: number;
    }>;
  }>;
  actions: Array<{
    id: string;
    jobId: string;
    userId: string;
    action: string;
    notes: string | null;
    createdAt: string;
    user: { id: string; name: string };
  }>;
  photos: Array<{
    id: string;
    url: string;
    fileName: string | null;
    caption: string | null;
    tag: string | null;
    createdAt: string;
    uploadedBy?: { id: string; name: string } | null;
  }>;
}

interface NextJobContractor {
  contactId: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface NextJobPendingOrder {
  id: string;
  supplierName: string;
  status: string;
  expectedDeliveryDate: string | null;
  itemsDescription: string | null;
}

interface NextJobDetail {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  sortOrder: number;
  assignedToId: string | null;
  contractors: NextJobContractor[];
  pendingOrders: NextJobPendingOrder[];
}

interface NextJobResponse {
  job: {
    id: string;
    name: string;
    plotName: string;
    siteName: string;
    endDate: string | null;
    actualEndDate: string | null;
  };
  nextJobs: NextJobDetail[];
  cascade: {
    needed: boolean;
    deltaDays: number;
    jobUpdates: Array<{
      jobId: string;
      jobName: string;
      originalStart: string | null;
      originalEnd: string | null;
      newStart: string;
      newEnd: string;
    }>;
    orderUpdates: Array<{
      orderId: string;
      originalOrderDate: string;
      originalDeliveryDate: string | null;
      newOrderDate: string;
      newDeliveryDate: string | null;
    }>;
  };
}

// ---------- Status Config ----------

// Status badges moved to @/components/shared/StatusBadge — single source
// of truth so IN_PROGRESS looks identical everywhere in the app.

const ACTION_ICON_MAP: Record<string, { icon: typeof Play; color: string }> = {
  start: { icon: Play, color: "text-amber-500" },
  stop: { icon: Pause, color: "text-red-500" },
  complete: { icon: CheckCircle, color: "text-green-500" },
  edit: { icon: Briefcase, color: "text-blue-500" },
};

// ---------- Main Component ----------

interface ContractorContact {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
}

interface JobSnag {
  id: string;
  description: string;
  status: string;
  priority: string;
  location: string | null;
  assignedTo: { name: string } | null;
  contact: { name: string; company: string | null } | null;
}

export function JobDetailClient({ job: initialJob }: { job: JobDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState(initialJob);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Centralised pre-start / early-start flow
  const { triggerAction: triggerJobAction, isLoading: jobActionLoading, dialogs: jobActionDialogs } = useJobAction(
    (_action, _jobId, data) => {
      if (data && typeof data === "object" && "status" in data) {
        setJob((prev) => ({ ...prev, status: (data as { status: string }).status }));
      }
      router.refresh();
    }
  );

  // Delay + Pull Forward flows — previously missing from Job Detail
  // (Keith Apr 2026 sweep: core-flow parity gap, every job-action
  // surface must expose these since they route through the same
  // cascade engine). Both fire router.refresh() on success so the
  // job's dates re-read from the server.
  const { openDelayDialog, dialogs: delayDialogs } = useDelayJob(async () => { router.refresh(); });
  const { openPullForwardDialog, dialogs: pullForwardDialogs } = usePullForwardDecision(async () => { router.refresh(); });

  // Inline snag + order status flips — quick one-click lifecycle from the job page.
  // Full sign-off (with photo) still routes to the snag surface; these handle the
  // "mark in progress" / "mark resolved" / "mark ordered" micro-transitions.
  const { setSnagStatus, isPending: isSnagPending } = useSnagAction({
    onChange: () => { router.refresh(); },
  });
  const { setOrderStatus, isPending: isOrderPending } = useOrderStatus({
    onChange: () => { router.refresh(); },
  });

  // Add note state
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: noteText.trim() }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to add note"));
        return;
      }
      const newAction = await res.json();
      setJob((prev) => ({ ...prev, actions: [newAction, ...prev.actions] }));
      setNoteText("");
    } finally {
      setSubmittingNote(false);
    }
  };

  // Add snag state
  const [snagDialogOpen, setSnagDialogOpen] = useState(false);

  // Snags linked to this job
  const [jobSnags, setJobSnags] = useState<JobSnag[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/plots/${initialJob.plotId}/snags`);
        if (cancelled) return;
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load snags"));
          return;
        }
        const data: Array<JobSnag & { jobId?: string | null }> = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setJobSnags(data.filter((s) => s.jobId === initialJob.id));
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load snags");
      }
    })();
    return () => { cancelled = true; };
  }, [initialJob.plotId, initialJob.id, toast]);

  // Contractor picker — unified via useJobContractorPicker.
  // Replaces ~65 lines of bespoke state + fetch + PUT logic that was
  // duplicated across JobWeekPanel. Single dialog, single flow.
  // router.refresh re-fetches server props so job.contractors stays in
  // the exact JobContractor shape the rest of the page expects.
  const { openPicker: openContractorPicker, dialogs: contractorPickerDialogs } =
    useJobContractorPicker(() => {
      router.refresh();
    });

  // Sign-off dialog state
  const [signOffDialogOpen, setSignOffDialogOpen] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signingOff, setSigningOff] = useState(false);

  // Confirm delivery dialog state
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryOrderId, setDeliveryOrderId] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(
    format(getCurrentDate(), "yyyy-MM-dd")
  );
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  // Post-delivery notification dialog state
  const [postDeliveryDialogOpen, setPostDeliveryDialogOpen] = useState(false);
  const [deliveryNotifySupplier, setDeliveryNotifySupplier] = useState("");
  const [deliveryNotifyContractors, setDeliveryNotifyContractors] = useState<Set<string>>(new Set());
  const [sendingDeliveryEmail, setSendingDeliveryEmail] = useState(false);

  // Post-signoff multi-step dialog state
  const [postSignOffDialogOpen, setPostSignOffDialogOpen] = useState(false);
  const [postSignOffData, setPostSignOffData] = useState<NextJobResponse | null>(null);
  const [postSignOffStep, setPostSignOffStep] = useState<"cascade" | "notify">("cascade");
  const [applyingCascade, setApplyingCascade] = useState(false);
  const [sendingNotifications, setSendingNotifications] = useState(false);
  const [notifyContractorIds, setNotifyContractorIds] = useState<Set<string>>(new Set());

  // Date editing state
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [editingEndDate, setEditingEndDate] = useState(false);
  const [editDateValue, setEditDateValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [dateCascadePreview, setDateCascadePreview] = useState<{
    deltaDays: number;
    jobUpdates: Array<{ jobId: string; jobName: string; originalStart: string | null; originalEnd: string | null; newStart: string; newEnd: string }>;
    orderUpdates: Array<{ orderId: string; originalOrderDate: string; originalDeliveryDate: string | null; newOrderDate: string; newDeliveryDate: string | null }>;
  } | null>(null);
  const [pendingEndDate, setPendingEndDate] = useState<string | null>(null);

  async function handleAction(action: string) {
    if (action === "complete") {
      setSignOffDialogOpen(true);
      return;
    }
    if (action === "start") {
      await triggerJobAction(
        { id: job.id, name: job.name, status: job.status, startDate: job.startDate, endDate: job.endDate, orders: job.orders.map((o) => ({ id: o.id, status: o.status, supplier: o.supplier })) },
        "start"
      );
      return;
    }
    setActionLoading(action);
    try {
      const res = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, `Failed to ${action} job`));
        return;
      }
      const updated = await res.json();
      setJob((prev) => ({ ...prev, status: updated.status }));
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSignOff() {
    setSigningOff(true);
    try {
      // Complete first, then sign off separately
      const completeRes = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!completeRes.ok) {
        toast.error(await fetchErrorMessage(completeRes, "Failed to complete job before sign-off"));
        return;
      }
      const res = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signoff",
          signOffNotes: signOffNotes || undefined,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to sign off job"));
        return;
      }
      const updated = await res.json();
      setJob((prev) => ({ ...prev, status: updated.status }));
      setSignOffDialogOpen(false);
      setSignOffNotes("");

      // Fetch next-job data for post-signoff dialog
      try {
        const nextRes = await fetch(`/api/jobs/${job.id}/next`);
        if (nextRes.ok) {
          const nextData: NextJobResponse = await nextRes.json();
          if (nextData.cascade.needed || nextData.nextJobs.length > 0) {
            setPostSignOffData(nextData);
            setPostSignOffStep(nextData.cascade.needed ? "cascade" : "notify");
            // Pre-select all contractors with emails
            const allIds = new Set<string>();
            for (const nj of nextData.nextJobs) {
              for (const c of nj.contractors) {
                if (c.email) allIds.add(c.contactId);
              }
            }
            setNotifyContractorIds(allIds);
            setPostSignOffDialogOpen(true);
          } else {
            router.refresh();
          }
        } else {
          router.refresh();
        }
      } catch {
        router.refresh();
      }
    } finally {
      setSigningOff(false);
    }
  }

  async function handleConfirmDelivery() {
    if (!deliveryOrderId) return;
    setConfirmingDelivery(true);
    try {
      const res = await fetch(`/api/orders/${deliveryOrderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DELIVERED",
          deliveredDate: deliveryDate,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to confirm delivery"));
        return;
      }
      // Capture supplier name before state update
      const confirmedOrder = job.orders.find((o) => o.id === deliveryOrderId);
      setJob((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === deliveryOrderId
            ? { ...o, status: "DELIVERED", deliveredDate: deliveryDate }
            : o
        ),
      }));
      setDeliveryDialogOpen(false);
      setDeliveryOrderId(null);
      setDeliveryNotes("");

      // Open post-delivery notification dialog if contractors with emails exist
      if (confirmedOrder && job.contractors.some((c) => c.contact.email)) {
        setDeliveryNotifySupplier(confirmedOrder.supplier.name);
        setDeliveryNotifyContractors(
          new Set(job.contractors.filter((c) => c.contact.email).map((c) => c.contactId))
        );
        setPostDeliveryDialogOpen(true);
      } else {
        router.refresh();
      }
    } finally {
      setConfirmingDelivery(false);
    }
  }

  async function handleSendDeliveryNotification() {
    setSendingDeliveryEmail(true);
    try {
      const contractorsToNotify = job.contractors.filter(
        (c) => deliveryNotifyContractors.has(c.contactId) && c.contact.email
      );
      const results = await Promise.all(
        contractorsToNotify.map((c) =>
          fetch("/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "delivery_confirmed",
              to: c.contact.email,
              recipientName: c.contact.name,
              data: {
                jobName: job.name,
                supplierName: deliveryNotifySupplier,
                siteName: job.plot.site.name,
                plotName: job.plot.name,
              },
            }),
          })
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error(await fetchErrorMessage(failed, "Failed to send delivery notification"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send delivery notification");
    } finally {
      setSendingDeliveryEmail(false);
      setPostDeliveryDialogOpen(false);
      router.refresh();
    }
  }

  async function handleApplyCascade() {
    if (!postSignOffData) return;
    setApplyingCascade(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEndDate: postSignOffData.job.actualEndDate,
          confirm: true,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to apply cascade"));
        return;
      }
      setPostSignOffStep("notify");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply cascade");
    } finally {
      setApplyingCascade(false);
    }
  }

  const handleStartDateSave = async () => {
    setSavingDate(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: editDateValue }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update start date"));
        return;
      }
      setEditingStartDate(false);
      router.refresh();
    } finally {
      setSavingDate(false);
    }
  };

  const handleEndDateChange = async () => {
    setSavingDate(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cascade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: editDateValue }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to preview cascade"));
        return;
      }
      const preview = await res.json();
      if (preview.jobUpdates?.length > 0 || preview.orderUpdates?.length > 0) {
        setDateCascadePreview(preview);
        setPendingEndDate(editDateValue);
      } else {
        // No cascade needed, just save
        const saveRes = await fetch(`/api/jobs/${job.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endDate: editDateValue }),
        });
        if (!saveRes.ok) {
          toast.error(await fetchErrorMessage(saveRes, "Failed to update end date"));
          return;
        }
        setEditingEndDate(false);
        router.refresh();
      }
    } finally {
      setSavingDate(false);
    }
  };

  const handleDateCascadeConfirm = async () => {
    if (!pendingEndDate) return;
    setSavingDate(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: pendingEndDate, confirm: true }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to apply date cascade"));
        return;
      }
      setDateCascadePreview(null);
      setPendingEndDate(null);
      setEditingEndDate(false);
      router.refresh();
    } finally {
      setSavingDate(false);
    }
  };

  async function handleSendNextStageNotification() {
    if (!postSignOffData) return;
    setSendingNotifications(true);
    try {
      let firstFailed: Response | null = null;
      for (const nj of postSignOffData.nextJobs) {
        const contractorsToNotify = nj.contractors.filter(
          (c) => notifyContractorIds.has(c.contactId) && c.email
        );
        const results = await Promise.all(
          contractorsToNotify.map((c) =>
            fetch("/api/email/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "next_stage_ready",
                to: c.email,
                recipientName: c.name,
                data: {
                  completedJobName: job.name,
                  nextJobName: nj.name,
                  siteName: job.plot.site.name,
                  plotName: job.plot.name,
                },
              }),
            })
          )
        );
        if (!firstFailed) {
          firstFailed = results.find((r) => !r.ok) ?? null;
        }
      }
      if (firstFailed) {
        toast.error(await fetchErrorMessage(firstFailed, "Failed to send next-stage notification"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send notifications");
    } finally {
      setSendingNotifications(false);
      setPostSignOffDialogOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" data-icon="inline-start" />
          Back
        </Button>

        <Breadcrumbs items={[
          { label: "Sites", href: "/sites" },
          { label: job.plot.site.name, href: `/sites/${job.plot.site.id}` },
          { label: job.plot.name, href: `/sites/${job.plot.siteId}/plots/${job.plotId}` },
          { label: job.name },
        ]} />

        <JobSiblingNav jobId={job.id} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{job.name}</h1>
              {job.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {job.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} size="md" />
            {job.status !== "IN_PROGRESS" && job.status !== "COMPLETED" && (
              <Button
                size="sm"
                onClick={() => handleAction("start")}
                disabled={actionLoading !== null}
              >
                <Play className="size-3.5" data-icon="inline-start" />
                {actionLoading === "start" ? "Starting..." : "Start"}
              </Button>
            )}
            {job.status === "IN_PROGRESS" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleAction("stop")}
                disabled={actionLoading !== null}
              >
                <Pause className="size-3.5" data-icon="inline-start" />
                {actionLoading === "stop" ? "Stopping..." : "Stop"}
              </Button>
            )}
            {job.status !== "COMPLETED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("complete")}
                disabled={actionLoading !== null}
              >
                <CheckCircle className="size-3.5" data-icon="inline-start" />
                Sign Off
              </Button>
            )}
            {/* Delay + Pull Forward — available on every non-completed
                job for parity with the Programme panel, Walkthrough, and
                Daily Brief. Click routes to the shared hook dialogs
                (same reason picker, same constraint-aware date picker). */}
            {job.status !== "COMPLETED" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => openPullForwardDialog({
                    id: job.id,
                    name: job.name,
                    startDate: job.startDate,
                    endDate: job.endDate,
                  })}
                  title="Shift this job's start earlier — useful when materials arrive early or the predecessor finishes ahead"
                >
                  Pull Forward
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => openDelayDialog({
                    id: job.id,
                    name: job.name,
                    startDate: job.startDate,
                    endDate: job.endDate,
                  })}
                  title="Push this job's end date back — picks up weather, contractor no-show, etc."
                >
                  Delay
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Site"
          value={job.plot.site.name}
          href={`/sites/${job.plot.siteId}`}
        />
        <InfoCard
          icon={LayoutGrid}
          label="Plot"
          value={job.plot.name}
          href={`/sites/${job.plot.siteId}/plots/${job.plotId}`}
        />
        <InfoCard
          icon={User}
          label="Assigned To"
          value={job.assignedTo?.name ?? "Unassigned"}
        />
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HardHat className="size-3.5" />
                <span className="text-xs font-medium">Contractors</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                onClick={() => openContractorPicker(
                  { id: job.id, name: job.name },
                  { currentContactIds: job.contractors.map((c) => c.contactId), mode: "multi" }
                )}
              >
                <UserPlus className="size-3" />
                Manage
              </Button>
            </div>
            {job.contractors.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">None assigned</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {job.contractors.map((c) => (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.contact.id}`}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {c.contact.company ? `${c.contact.company}` : c.contact.name}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Start Date - editable */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-3.5" />
              <span className="text-xs font-medium">Start Date</span>
            </div>
            {editingStartDate ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={editDateValue}
                  onChange={(e) => setEditDateValue(e.target.value)}
                  className="min-w-0 flex-1 rounded border px-2 py-1 text-sm sm:flex-none"
                />
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleStartDateSave} disabled={savingDate}>
                  {savingDate ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingStartDate(false)}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <p
                className="mt-1 flex items-center gap-2 text-sm font-medium cursor-pointer group"
                onClick={() => { setEditDateValue(job.startDate?.split("T")[0] || ""); setEditingStartDate(true); }}
              >
                {job.startDate ? format(new Date(job.startDate), "dd MMM yyyy") : "\u2014"}
                <Pencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </p>
            )}
          </CardContent>
        </Card>
        {/* End Date - editable with cascade support */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-3.5" />
              <span className="text-xs font-medium">End Date</span>
            </div>
            {editingEndDate ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={editDateValue}
                  onChange={(e) => setEditDateValue(e.target.value)}
                  className="min-w-0 flex-1 rounded border px-2 py-1 text-sm sm:flex-none"
                />
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleEndDateChange} disabled={savingDate}>
                  {savingDate ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingEndDate(false)}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <p
                className="mt-1 flex items-center gap-2 text-sm font-medium cursor-pointer group"
                onClick={() => { setEditDateValue(job.endDate?.split("T")[0] || ""); setEditingEndDate(true); }}
              >
                {job.endDate ? format(new Date(job.endDate), "dd MMM yyyy") : "\u2014"}
                <Pencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders + Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <CardTitle>Material Orders</CardTitle>
            </div>
            <CardDescription>
              {job.orders.length} order{job.orders.length !== 1 ? "s" : ""}{" "}
              for this job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.orders.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Package className="size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No orders placed yet
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {job.orders.map((order) => {
                  const orderTotal = order.orderItems.reduce(
                    (sum, item) => sum + item.totalCost,
                    0
                  );
                  return (
                    <div
                      key={order.id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {order.supplier.name}
                        </p>
                        {order.orderDetails && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {order.orderDetails}
                          </p>
                        )}
                        {order.orderItems.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {order.orderItems.map((item) => (
                              <p key={item.id} className="text-xs text-muted-foreground">
                                {item.name} &mdash; {item.quantity} {item.unit} @ {item.unitCost.toFixed(2)} = {item.totalCost.toFixed(2)}
                              </p>
                            ))}
                            <p className="text-xs font-medium">
                              Total: {orderTotal.toFixed(2)}
                            </p>
                          </div>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ordered{" "}
                          {format(
                            new Date(order.dateOfOrder),
                            "dd MMM yyyy"
                          )}
                          {order.expectedDeliveryDate &&
                            ` \u2022 Expected ${format(
                              new Date(order.expectedDeliveryDate),
                              "dd MMM yyyy"
                            )}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <OrderStatusBadge status={order.status} />
                        {order.status === "PENDING" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 border-blue-200 px-2 text-[11px] text-blue-700 hover:bg-blue-50"
                            disabled={isOrderPending(order.id)}
                            onClick={() => setOrderStatus(order.id, "ORDERED")}
                          >
                            {isOrderPending(order.id) ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Send className="size-3" />
                            )}
                            Mark Ordered
                          </Button>
                        )}
                        {order.status !== "DELIVERED" &&
                          order.status !== "CANCELLED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setDeliveryOrderId(order.id);
                                setDeliveryDate(
                                  format(getCurrentDate(), "yyyy-MM-dd")
                                );
                                setDeliveryNotes("");
                                setDeliveryDialogOpen(true);
                              }}
                            >
                              <CheckCircle className="size-3" />
                              Confirm Delivery
                            </Button>
                          )}
                        {order.status === "DELIVERED" &&
                          order.deliveredDate && (
                            <span className="text-[10px] text-green-600">
                              Delivered{" "}
                              {format(
                                new Date(order.deliveredDate),
                                "dd MMM"
                              )}
                            </span>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Note */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-muted-foreground" />
              <CardTitle>Add Note</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Textarea
                placeholder="Type a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                className="resize-none text-sm"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
              />
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={submittingNote || !noteText.trim()}
                className="self-end"
              >
                {submittingNote ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Actions / History */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <CardTitle>Action History</CardTitle>
            </div>
            <CardDescription>
              Timeline of actions taken on this job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.actions.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Clock className="size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No actions recorded yet
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {job.actions.map((action, index) => {
                  const actionConfig =
                    ACTION_ICON_MAP[action.action] ?? {
                      icon: Briefcase,
                      color: "text-muted-foreground",
                    };
                  const ActionIcon = actionConfig.icon;
                  const actionLabel =
                    action.action.charAt(0).toUpperCase() +
                    action.action.slice(1);

                  return (
                    <div
                      key={action.id}
                      className={`flex items-start gap-3 py-3 ${
                        index !== job.actions.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <div className="mt-0.5">
                        <ActionIcon
                          className={`size-4 ${actionConfig.color}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {actionLabel}
                          {action.action === "start" && "ed"}
                          {action.action === "stop" && "ped"}
                          {action.action === "complete" && "d"}
                          {action.action === "edit" && "ed"}
                        </p>
                        {action.notes && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {action.notes}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>by {action.user.name}</span>
                          <span className="text-border">&middot;</span>
                          <span>
                            {formatDistanceToNow(
                              new Date(action.createdAt),
                              { addSuffix: true }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Photos */}
      <PhotoUpload
        jobId={job.id}
        photos={job.photos}
        onPhotosChange={(newPhotos) =>
          setJob((prev) => ({ ...prev, photos: newPhotos }))
        }
      />

      {/* Notes */}
      {job.description && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {job.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Snags linked to this job */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="size-4 text-muted-foreground" />
              <CardTitle>Snags ({jobSnags.length})</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSnagDialogOpen(true)}>
                <AlertTriangle className="size-3 mr-1" />
                Raise Snag
              </Button>
              <Link
                href={`/sites/${job.plot.siteId}/plots/${job.plotId}?tab=snags`}
                className="text-xs text-blue-600 hover:underline"
              >
                View all →
              </Link>
            </div>
          </div>
          <CardDescription>Snags raised against this job</CardDescription>
        </CardHeader>
        <CardContent>
          {jobSnags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snags linked to this job</p>
          ) : (
            <div className="space-y-2">
              {jobSnags.map((snag) => {
                const pending = isSnagPending(snag.id);
                return (
                  <div
                    key={snag.id}
                    className="rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/sites/${job.plot.siteId}?tab=snags&snagId=${snag.id}`}
                        className="min-w-0 flex-1 no-underline"
                      >
                        <p className="text-sm font-medium text-foreground">{snag.description}</p>
                        {snag.location && <p className="text-xs text-muted-foreground mt-0.5">{snag.location}</p>}
                        {(snag.assignedTo || snag.contact) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {snag.contact?.company || snag.contact?.name || snag.assignedTo?.name}
                          </p>
                        )}
                      </Link>
                      <div className="ml-3 flex flex-col items-end gap-1 shrink-0">
                        <SnagStatusBadge status={snag.status} />
                        <SnagPriorityBadge priority={snag.priority} />
                      </div>
                    </div>
                    {/* Inline lifecycle flips (useSnagAction). Close-with-photo still
                        routes to snag detail for the rich dialog. */}
                    {(snag.status === "OPEN" || snag.status === "IN_PROGRESS") && (
                      <div className="mt-2 flex items-center gap-1 border-t pt-2">
                        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Quick actions</span>
                        {snag.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                            disabled={pending}
                            onClick={() => setSnagStatus(snag.id, "IN_PROGRESS")}
                          >
                            {pending ? <Loader2 className="size-2.5 animate-spin" /> : <Activity className="size-2.5" />}
                            Mark In Progress
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 border-emerald-200 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50"
                          disabled={pending}
                          onClick={() => setSnagStatus(snag.id, "RESOLVED")}
                        >
                          {pending ? <Loader2 className="size-2.5 animate-spin" /> : <CheckCircle className="size-2.5" />}
                          Mark Resolved
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified contractor picker (useJobContractorPicker) */}
      {contractorPickerDialogs}

      {/* Sign-Off Dialog */}
      <Dialog open={signOffDialogOpen} onOpenChange={setSignOffDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <HelpTip title="About Sign-Off" anchor="below-left">
            <p><strong>What it does:</strong> locks the actual end date on this job and triggers the post-completion decision flow (cascade / notify downstream).</p>
            <p><strong>Why:</strong> sign-off is the point where &ldquo;done&rdquo; becomes auditable — it snapshots the date, attaches your notes and photos, and wakes up the next job in the programme.</p>
            <p><strong>Gotcha:</strong> once signed off you can&apos;t edit the actual end date from this screen — do any final date fixes <em>before</em> signing off. If the job ran early or late, the next step offers to pull forward or delay downstream jobs.</p>
          </HelpTip>
          <DialogHeader>
            <DialogTitle>Sign Off Job</DialogTitle>
            <DialogDescription>
              Confirm completion and sign off &ldquo;{job.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sign-off-notes">Sign-Off Notes</Label>
              <Textarea
                id="sign-off-notes"
                placeholder="Any notes about the completed job..."
                value={signOffNotes}
                onChange={(e) => setSignOffNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Photos (optional)</Label>
              <PhotoUpload
                jobId={job.id}
                photos={job.photos}
                onPhotosChange={(newPhotos) =>
                  setJob((prev) =>
                    prev ? { ...prev, photos: newPhotos } : prev
                  )
                }
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSignOff}
              disabled={signingOff}
              className="bg-green-600 hover:bg-green-700"
            >
              {signingOff ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing off...
                </>
              ) : (
                <>
                  <CheckCircle className="size-4" />
                  Sign Off &amp; Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delivery Dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delivery</DialogTitle>
            <DialogDescription>
              Mark this order as delivered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="delivery-date">Delivery Date</Label>
              <Input
                id="delivery-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleConfirmDelivery}
              disabled={confirmingDelivery}
              className="bg-green-600 hover:bg-green-700"
            >
              {confirmingDelivery ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Confirm Delivery"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Delivery Notification Dialog */}
      <Dialog
        open={postDeliveryDialogOpen}
        onOpenChange={(open) => {
          setPostDeliveryDialogOpen(open);
          if (!open) router.refresh();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5 text-blue-500" />
              Notify Contractors?
            </DialogTitle>
            <DialogDescription>
              Delivery from <strong>{deliveryNotifySupplier}</strong> has been
              confirmed for &ldquo;{job.name}&rdquo;. Would you like to email
              the contractors?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[40vh] space-y-1 overflow-y-auto py-2">
            {job.contractors.map((c) => {
              const checked = deliveryNotifyContractors.has(c.contactId);
              const hasEmail = !!c.contact.email;
              return (
                <label
                  key={c.contactId}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    !hasEmail
                      ? "opacity-50 cursor-not-allowed"
                      : checked
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked && hasEmail}
                    disabled={!hasEmail}
                    onChange={() => {
                      if (!hasEmail) return;
                      setDeliveryNotifyContractors((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.contactId)) next.delete(c.contactId);
                        else next.add(c.contactId);
                        return next;
                      });
                    }}
                    className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.contact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.contact.email || "No email address"}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPostDeliveryDialogOpen(false);
                router.refresh();
              }}
            >
              Skip
            </Button>
            <Button
              onClick={handleSendDeliveryNotification}
              disabled={
                sendingDeliveryEmail || deliveryNotifyContractors.size === 0
              }
            >
              {sendingDeliveryEmail ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send Email ({deliveryNotifyContractors.size})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-SignOff Multi-Step Dialog */}
      <Dialog
        open={postSignOffDialogOpen}
        onOpenChange={(open) => {
          setPostSignOffDialogOpen(open);
          if (!open) router.refresh();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {/* Step A: Cascade Preview */}
          {postSignOffData &&
            postSignOffStep === "cascade" &&
            postSignOffData.cascade.needed && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Calendar className="size-5 text-amber-500" />
                    Schedule Adjustment
                  </DialogTitle>
                  <DialogDescription>
                    This job finished{" "}
                    <strong>
                      {Math.abs(postSignOffData.cascade.deltaDays)} day
                      {Math.abs(postSignOffData.cascade.deltaDays) !== 1
                        ? "s"
                        : ""}{" "}
                      {postSignOffData.cascade.deltaDays > 0 ? "late" : "early"}
                    </strong>
                    . Would you like to shift the subsequent schedule?
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
                  {postSignOffData.cascade.jobUpdates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Jobs affected
                      </p>
                      {postSignOffData.cascade.jobUpdates.map((ju) => (
                        <div
                          key={ju.jobId}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{ju.jobName}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {ju.originalStart
                                ? format(new Date(ju.originalStart), "dd MMM")
                                : "—"}{" "}
                              –{" "}
                              {ju.originalEnd
                                ? format(new Date(ju.originalEnd), "dd MMM")
                                : "—"}
                            </span>
                            <ArrowRight className="size-3" />
                            <span className="font-medium text-foreground">
                              {format(new Date(ju.newStart), "dd MMM")} –{" "}
                              {format(new Date(ju.newEnd), "dd MMM")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {postSignOffData.cascade.orderUpdates.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Orders affected
                      </p>
                      {postSignOffData.cascade.orderUpdates.map((ou) => (
                        <div
                          key={ou.orderId}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                        >
                          <span className="text-muted-foreground">Order</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {format(
                                new Date(ou.originalOrderDate),
                                "dd MMM"
                              )}
                              {ou.originalDeliveryDate
                                ? ` \u2192 ${format(new Date(ou.originalDeliveryDate), "dd MMM")}`
                                : ""}
                            </span>
                            <ArrowRight className="size-3" />
                            <span className="font-medium text-foreground">
                              {format(new Date(ou.newOrderDate), "dd MMM")}
                              {ou.newDeliveryDate
                                ? ` \u2192 ${format(new Date(ou.newDeliveryDate), "dd MMM")}`
                                : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (postSignOffData.nextJobs.length > 0) {
                        setPostSignOffStep("notify");
                      } else {
                        setPostSignOffDialogOpen(false);
                        router.refresh();
                      }
                    }}
                  >
                    Skip
                  </Button>
                  <Button
                    onClick={handleApplyCascade}
                    disabled={applyingCascade}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {applyingCascade ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Calendar className="size-4" />
                        Apply Cascade
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}

          {/* Step B: Next Stage Notification / Blocking */}
          {postSignOffData && postSignOffStep === "notify" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {postSignOffData.nextJobs.some(
                    (nj) => nj.pendingOrders.length > 0
                  ) ? (
                    <AlertTriangle className="size-5 text-amber-500" />
                  ) : (
                    <CheckCircle className="size-5 text-green-500" />
                  )}
                  Next Stage
                </DialogTitle>
                <DialogDescription>
                  {postSignOffData.nextJobs.length === 0
                    ? "No subsequent jobs found \u2014 this was the last stage."
                    : `${postSignOffData.nextJobs.length} job${postSignOffData.nextJobs.length !== 1 ? "s" : ""} in the next stage.`}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] space-y-4 overflow-y-auto py-2">
                {postSignOffData.nextJobs.map((nj) => {
                  const hasBlockingOrders = nj.pendingOrders.length > 0;
                  return (
                    <div
                      key={nj.id}
                      className={`rounded-lg border p-3 ${
                        hasBlockingOrders
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-green-200 bg-green-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hasBlockingOrders ? (
                          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                        ) : (
                          <CheckCircle className="size-4 shrink-0 text-green-500" />
                        )}
                        <p className="text-sm font-medium">{nj.name}</p>
                      </div>

                      {hasBlockingOrders ? (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs font-medium text-amber-700">
                            Cannot start \u2014 awaiting delivery:
                          </p>
                          {nj.pendingOrders.map((po) => (
                            <div
                              key={po.id}
                              className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${
                                po.status === "PENDING"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              <span>
                                {po.supplierName}
                                {po.itemsDescription
                                  ? ` \u2014 ${po.itemsDescription}`
                                  : ""}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant={
                                    po.status === "PENDING"
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="h-5 text-[10px]"
                                >
                                  {po.status === "PENDING"
                                    ? "Not Ordered!"
                                    : po.status}
                                </Badge>
                                {po.expectedDeliveryDate && (
                                  <span className="text-[10px]">
                                    Due{" "}
                                    {format(
                                      new Date(po.expectedDeliveryDate),
                                      "dd MMM"
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-green-700">
                            Ready to begin
                          </p>
                          {nj.contractors.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {nj.contractors.map((c) => {
                                const checked = notifyContractorIds.has(
                                  c.contactId
                                );
                                const hasEmail = !!c.email;
                                return (
                                  <label
                                    key={c.contactId}
                                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                                      !hasEmail
                                        ? "cursor-not-allowed opacity-50"
                                        : checked
                                          ? "bg-green-100 ring-1 ring-green-300"
                                          : "hover:bg-green-100/50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked && hasEmail}
                                      disabled={!hasEmail}
                                      onChange={() => {
                                        if (!hasEmail) return;
                                        setNotifyContractorIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(c.contactId))
                                            next.delete(c.contactId);
                                          else next.add(c.contactId);
                                          return next;
                                        });
                                      }}
                                      className="size-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="font-medium">{c.name}</span>
                                    <span className="text-muted-foreground">
                                      {c.email || "No email"}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {nj.contractors.length === 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              No contractors assigned to this job.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                {postSignOffData.nextJobs.every(
                  (nj) => nj.pendingOrders.length > 0
                ) ? (
                  <Button
                    onClick={() => {
                      setPostSignOffDialogOpen(false);
                      router.refresh();
                    }}
                  >
                    Got it
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPostSignOffDialogOpen(false);
                        router.refresh();
                      }}
                    >
                      Skip
                    </Button>
                    <Button
                      onClick={handleSendNextStageNotification}
                      disabled={
                        sendingNotifications || notifyContractorIds.size === 0
                      }
                    >
                      {sendingNotifications ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="size-4" />
                          Notify ({notifyContractorIds.size})
                        </>
                      )}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Date Cascade Preview Dialog */}
      <Dialog
        open={dateCascadePreview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDateCascadePreview(null);
            setPendingEndDate(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="size-5 text-amber-500" />
              Schedule Adjustment
            </DialogTitle>
            <DialogDescription>
              Changing the end date shifts subsequent jobs by{" "}
              <strong>
                {dateCascadePreview
                  ? `${Math.abs(dateCascadePreview.deltaDays)} day${Math.abs(dateCascadePreview.deltaDays) !== 1 ? "s" : ""} ${dateCascadePreview.deltaDays > 0 ? "later" : "earlier"}`
                  : ""}
              </strong>
              . Would you like to cascade this change?
            </DialogDescription>
          </DialogHeader>
          {dateCascadePreview && (
            <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
              {dateCascadePreview.jobUpdates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Jobs affected
                  </p>
                  {dateCascadePreview.jobUpdates.map((ju) => (
                    <div
                      key={ju.jobId}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{ju.jobName}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {ju.originalStart
                            ? format(new Date(ju.originalStart), "dd MMM")
                            : "\u2014"}{" "}
                          \u2013{" "}
                          {ju.originalEnd
                            ? format(new Date(ju.originalEnd), "dd MMM")
                            : "\u2014"}
                        </span>
                        <ArrowRight className="size-3" />
                        <span className="font-medium text-foreground">
                          {format(new Date(ju.newStart), "dd MMM")} \u2013{" "}
                          {format(new Date(ju.newEnd), "dd MMM")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {dateCascadePreview.orderUpdates.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Orders affected
                  </p>
                  {dateCascadePreview.orderUpdates.map((ou) => (
                    <div
                      key={ou.orderId}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">Order</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(ou.originalOrderDate), "dd MMM")}
                          {ou.originalDeliveryDate
                            ? ` \u2192 ${format(new Date(ou.originalDeliveryDate), "dd MMM")}`
                            : ""}
                        </span>
                        <ArrowRight className="size-3" />
                        <span className="font-medium text-foreground">
                          {format(new Date(ou.newOrderDate), "dd MMM")}
                          {ou.newDeliveryDate
                            ? ` \u2192 ${format(new Date(ou.newDeliveryDate), "dd MMM")}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                // Save end date without cascade
                setSavingDate(true);
                try {
                  const res = await fetch(`/api/jobs/${job.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endDate: pendingEndDate }),
                  });
                  if (!res.ok) {
                    toast.error(await fetchErrorMessage(res, "Failed to update end date"));
                    return;
                  }
                  setDateCascadePreview(null);
                  setPendingEndDate(null);
                  setEditingEndDate(false);
                  router.refresh();
                } finally {
                  setSavingDate(false);
                }
              }}
            >
              Skip (save date only)
            </Button>
            <Button onClick={handleDateCascadeConfirm} disabled={savingDate}>
              {savingDate ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply Cascade"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise Snag — full SnagDialog */}
      <SnagDialog
        open={snagDialogOpen}
        onOpenChange={setSnagDialogOpen}
        plotId={job.plotId}
        initialJobId={job.id}
        initialContactId={job.contractors?.[0]?.contactId}
        onSaved={() => {
          // Refresh snags list
          fetch(`/api/jobs/${job.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.snags) setJobSnags(d.snags); })
            .catch(() => {});
        }}
      />

      {/* Centralised pre-start / early-start / order-conflict dialogs */}
      {jobActionDialogs}
      {/* Delay + Pull Forward dialogs — rendered from shared hooks so
          the UX matches Walkthrough, Daily Brief, and JobWeekPanel. */}
      {delayDialogs}
      {pullForwardDialogs}
    </div>
  );
}

// ---------- Info Card ----------

function InfoCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        {href ? (
          <Link href={href} className="mt-1 block truncate text-sm font-medium text-blue-600 hover:underline">
            {value}
          </Link>
        ) : (
          <p className="mt-1 truncate text-sm font-medium">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
