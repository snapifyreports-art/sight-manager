"use client";

import { useState, useCallback, useEffect } from "react";
import { differenceInCalendarDays, addDays, format } from "date-fns";
import { AlertTriangle, Loader2, Truck } from "lucide-react";
import { addWorkingDays, differenceInWorkingDays, isWorkingDay, snapToWorkingDay } from "@/lib/working-days";
import { useToast } from "@/components/ui/toast";
import { OrderDeliveryFollowUpDialog } from "@/components/orders/OrderDeliveryFollowUpDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface JobForAction {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  orders?: Array<{ id: string; status: string; supplier: { name: string }; expectedDeliveryDate?: string | null; dateOfOrder?: string | null }>;
}

/**
 * Centralised hook for job actions (start / stop / complete / note).
 *
 * Handles the full pre-start flow identically to JobWeekPanel:
 *   1. Incomplete predecessor check (siblings API)
 *   2. Undelivered orders warning
 *   3. Early-start programme impact dialog (Pull Forward / Expand)
 *   4. Order-date conflict check before pulling forward
 *
 * The job is passed at call time (not hook construction time) so a single
 * hook instance can handle multiple different jobs on the same page.
 *
 * Usage:
 *   const { triggerAction, isLoading, dialogs } = useJobAction((action, id) => refresh());
 *   // In JSX: {dialogs}
 *   // On button: onClick={() => triggerAction(job, "start")}
 */
export function useJobAction(
  onSuccess?: (action: string, jobId: string, data?: unknown) => void
) {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // The job currently being processed (kept in state so dialogs can reference it)
  const [activeJob, setActiveJob] = useState<JobForAction | null>(null);

  // ---- Pre-start checks ----
  const [preStartChecks, setPreStartChecks] = useState<{
    prevJob: { id: string; name: string } | null;
    undeliveredOrders: Array<{ id: string; supplier: string; status: string; expectedDeliveryDate?: string | null; dateOfOrder?: string | null }>;
    nearestEvent: { date: string; supplierName: string; label: string; alreadyTimed?: boolean } | null;
    signOffPrev: boolean;
    markDelivered: boolean;
  } | null>(null);
  const [preStartLoading, setPreStartLoading] = useState(false);

  // ---- Order resolution dialog (forced step-by-step) ----
  const [orderResolution, setOrderResolution] = useState<{
    orders: Array<{ id: string; supplier: string; status: string }>;
    resolved: Set<string>;
  } | null>(null);

  // ---- Early-start dialog ----
  const [earlyStartDialog, setEarlyStartDialog] = useState<{
    daysEarly: number;
    endDate: string | null;
    nearestEvent?: { date: string; label: string; daysToEvent: number } | null;
    targetDate?: string | null; // if set, pull to this date instead of today (e.g. delivery date)
  } | null>(null);
  // Pre-flight result for the full Pull Forward shift — if the cascade
  // would conflict (downstream job would start in the past, or an order
  // would need placing in the past), we disable the button + explain why
  // instead of letting the user click and get a toast error.
  const [pullForwardFeasibility, setPullForwardFeasibility] = useState<
    { status: "checking" | "ok" | "conflict"; reason?: string; earliestStart?: Date | null } | null
  >(null);
  // User-picked custom start date for "Pull to specific date" option.
  const [customPullDate, setCustomPullDate] = useState<string>("");
  const [customPullFeasibility, setCustomPullFeasibility] = useState<
    {
      status: "checking" | "ok" | "conflict";
      reason?: string;
      earliestStart?: Date | null;
      /** (#167) When non-empty AND status="conflict", the dialog offers
       *  "Start anyway — mark order(s) sent". */
      overrideableOrders?: { id: string; supplierName?: string | null }[];
    } | null
  >(null);
  // (#167) Delivery follow-up populated once a "Start anyway" cascade
  // commits — drives <OrderDeliveryFollowUpDialog>.
  const [pendingDelivery, setPendingDelivery] = useState<
    { id: string; supplierName?: string | null }[] | null
  >(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);

  // ---- Late-start dialog ----
  const [lateStartDialog, setLateStartDialog] = useState<{
    daysLate: number;
    startDate: string;
    endDate: string | null;
    originalDuration: number;
    compressedDuration: number;
    cascadePreview: { jobCount: number; deltaDays: number } | null;
  } | null>(null);

  // ---- Order conflict warning ----
  const [orderConflictDialog, setOrderConflictDialog] = useState<{
    conflicts: Array<{
      jobName: string;
      orderDate: string;
      deliveryDate: string | null;
      newOrderDate: string;
      newDeliveryDate: string | null;
    }>;
    onConfirm: () => void;
  } | null>(null);

  // Track whether user chose "start anyway" (skip order auto-progression)
  const [skipOrderProgression, setSkipOrderProgression] = useState(false);

  // ---- Stop-reason dialog ----
  // Keith's "flow of decision" rule: stopping a job is a deliberate call, not a
  // reflex. Every surface that triggers stop (Tasks, Jobs, JobDetail, Programme)
  // now goes through this dialog so the reason is captured at the moment of
  // decision rather than inferred later from an audit log.
  const [stopDialog, setStopDialog] = useState<{ job: JobForAction } | null>(null);
  const [stopReason, setStopReason] = useState("");

  // ---- Core action executor ----
  const executeAction = useCallback(
    async (jobId: string, action: string, notes?: string, extraBody?: Record<string, unknown>) => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, notes, ...extraBody }),
        });
        if (res.ok) {
          const data = await res.json();
          // User-visible confirmation for the main lifecycle actions.
          if (action === "start") toast.success("Job started");
          else if (action === "complete") toast.success("Job marked complete");
          else if (action === "signoff") toast.success("Job signed off");
          else if (action === "stop") toast.success("Job put on hold");
          onSuccess?.(action, jobId, data);
        } else {
          const err = await res.json().catch(() => null);
          toast.error(err?.error ?? `Failed to ${action} job (HTTP ${res.status})`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to ${action} job`);
      } finally {
        setIsLoading(false);
        setActiveJob(null);
      }
    },
    [onSuccess, toast]
  );

  // ---- Simple-action executor (no pre-start checks) ----
  // For surfaces that need the pre-start dialog flow, use triggerAction.
  // For everywhere else (note, signoff on already-completed, stop, complete
  // without pre-start checks), use this lean alternative.
  // Accepts the full action body — normalises `notes` vs `note` to prevent
  // the silent data-drop bug we had across 11 components.
  const runSimpleAction = useCallback(
    async (
      jobId: string,
      action: "start" | "stop" | "complete" | "signoff" | "note",
      opts?: {
        notes?: string;
        signOffNotes?: string;
        skipOrderProgression?: boolean;
        actualStartDate?: string;
        silent?: boolean; // if true, skip success toast (caller will do its own feedback)
      }
    ): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
      setIsLoading(true);
      try {
        const body: Record<string, unknown> = { action };
        if (opts?.notes !== undefined) body.notes = opts.notes;
        if (opts?.signOffNotes !== undefined) body.signOffNotes = opts.signOffNotes;
        if (opts?.skipOrderProgression) body.skipOrderProgression = true;
        if (opts?.actualStartDate) body.actualStartDate = opts.actualStartDate;

        const res = await fetch(`/api/jobs/${jobId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
          if (!opts?.silent) {
            if (action === "start") toast.success("Job started");
            else if (action === "complete") toast.success("Job marked complete");
            else if (action === "signoff") toast.success("Job signed off");
            else if (action === "stop") toast.success("Job put on hold");
            else if (action === "note") toast.success("Note added");
          }
          onSuccess?.(action, jobId, data);
          return { ok: true, data };
        } else {
          const err = await res.json().catch(() => null);
          const msg = err?.error ?? `Failed to ${action} job (HTTP ${res.status})`;
          if (!opts?.silent) toast.error(msg);
          return { ok: false, error: msg };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `Failed to ${action} job`;
        if (!opts?.silent) toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, toast]
  );

  // ---- Preview a cascade without applying ----
  // Used by Walkthrough's "Preview Impact" button. Single source of truth
  // for cascade preview calls — if the preview API shape ever changes,
  // there's one place to update.
  const previewCascade = useCallback(
    async (
      jobId: string,
      newEndDate: string
    ): Promise<{ ok: boolean; deltaDays?: number; jobUpdates?: unknown[]; orderUpdates?: unknown[]; conflicts?: unknown[]; error?: string }> => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/cascade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          return { ok: false, error: err?.error ?? `Preview failed (HTTP ${res.status})` };
        }
        const data = await res.json();
        return {
          ok: true,
          deltaDays: data.deltaDays,
          jobUpdates: data.jobUpdates,
          orderUpdates: data.orderUpdates,
          conflicts: data.conflicts,
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Preview failed" };
      }
    },
    []
  );

  // ---- Preflight check for Pull Forward ----
  // Posts to the cascade preview endpoint (no DB writes) to find out if
  // the proposed shift would hit a conflict (downstream job/order in past).
  // Returns ok:true if safe, or ok:false with a human-readable reason.
  const previewPullForward = useCallback(
    async (jobId: string, endDate: string, daysEarly: number):
      Promise<{
        ok: boolean;
        reason?: string;
        shiftGapDays?: number;
        /** (#167) Order-conflict details so the dialog can offer the
         *  "Start anyway — mark order(s) sent" override. Empty when the
         *  conflict isn't order-driven (e.g. a downstream job is the
         *  blocker — that can't be overridden this way). */
        overrideableOrders?: { id: string; supplierName?: string | null }[];
      }> => {
      try {
        const newEnd = addWorkingDays(new Date(endDate), -daysEarly)
          .toLocaleDateString("en-CA");
        const res = await fetch(`/api/jobs/${jobId}/cascade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate: newEnd }),
        });
        if (!res.ok) return { ok: false, reason: "Cascade preview failed" };
        const data = await res.json();
        if (data.conflicts && data.conflicts.length > 0) {
          const first = data.conflicts[0];
          const reason =
            first.kind === "job_in_past"
              ? `Shift blocked — "${first.jobName || "a downstream job"}" would start in the past.`
              : first.kind === "order_in_past"
                ? `Shift blocked — an order would need placing in the past.`
                : "Programme conflict";

          // How much of the shift was "too much"? For every offending date
          // (order placement or downstream job start) that landed before
          // `today`, compute the working-day gap between today and that
          // proposed date. The largest gap across all conflicts is the
          // binding constraint — the shift needs to be *reduced* by at least
          // that many working days. Caller uses this to quote an
          // "Earliest allowed: <date>" instead of vague "Try a later date."
          let shiftGapDays = 0;
          for (const c of data.conflicts) {
            if (!c.proposedDate || !c.today) continue;
            const proposed = new Date(c.proposedDate);
            const today = new Date(c.today);
            const gap = differenceInWorkingDays(today, proposed);
            if (gap > shiftGapDays) shiftGapDays = gap;
          }

          // (#167) Override is offered ONLY when EVERY conflict is an
          // order_in_past — a single downstream job_in_past makes the
          // override insufficient (overriding orders won't help a job
          // that's blocked by a different job).
          const onlyOrders =
            data.conflicts.length > 0 &&
            data.conflicts.every((c: { kind: string }) => c.kind === "order_in_past");
          const overrideableOrders = onlyOrders
            ? data.conflicts
                .filter((c: { kind: string; orderId?: string }) => c.kind === "order_in_past" && c.orderId)
                .map((c: { orderId: string; supplierName?: string }) => ({
                  id: c.orderId,
                  supplierName: c.supplierName ?? null,
                }))
            : [];

          return { ok: false, reason, shiftGapDays, overrideableOrders };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "Preview error" };
      }
    },
    []
  );

  // ---- Run preflight whenever the early-start dialog opens ----
  // Resets any stale feasibility when the dialog closes, and seeds the
  // custom date picker to today (the earliest possible start).
  useEffect(() => {
    if (!earlyStartDialog || !activeJob || !activeJob.endDate) {
      setPullForwardFeasibility(null);
      setCustomPullFeasibility(null);
      setCustomPullDate("");
      return;
    }
    setPullForwardFeasibility({ status: "checking" });
    // Default custom date = today (max pull). User can bump it later.
    // IMPORTANT: use date-fns format() which respects the local timezone.
    // toISOString() converts to UTC and in BST (UTC+1) "today 00:00 local"
    // is "yesterday 23:00 UTC" → picker defaulted to yesterday. Bug report
    // filed by Keith while testing the dialog.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setCustomPullDate(format(today, "yyyy-MM-dd"));
    // Use outer async function so React cleanup works cleanly.
    let cancelled = false;
    (async () => {
      const result = await previewPullForward(
        activeJob.id,
        activeJob.endDate!,
        earlyStartDialog.daysEarly
      );
      if (cancelled) return;
      if (result.ok) {
        setPullForwardFeasibility({ status: "ok" });
      } else {
        // If we know the gap, convert it to an absolute date the user can
        // type into the picker: today + gap working days.
        const earliestStart = result.shiftGapDays && result.shiftGapDays > 0
          ? addWorkingDays(today, result.shiftGapDays)
          : null;
        setPullForwardFeasibility({
          status: "conflict",
          reason: result.reason,
          earliestStart,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [earlyStartDialog, activeJob, previewPullForward]);

  // ---- Pull forward then start ----
  // `daysEarly` is in WORKING days — matches the cascade engine (see
  // docs/cascade-spec.md). Caller computes this via differenceInWorkingDays.
  const executePullForward = useCallback(
    async (
      job: JobForAction,
      daysEarly: number,
      endDate: string | null,
      opts?: {
        assumeOrdersSent?: { id: string; supplierName?: string | null }[];
      },
    ) => {
      console.log("[CASCADE] executePullForward called:", { jobId: job.id, daysEarly, endDate });
      setCascadeLoading(true);
      try {
        let overriddenOrders: { id: string }[] = [];
        if (endDate) {
          const newEnd = addWorkingDays(new Date(endDate), -daysEarly)
            .toLocaleDateString("en-CA");
          console.log("[CASCADE] Calling cascade PUT:", { jobId: job.id, newEnd });
          const cascadeRes = await fetch(`/api/jobs/${job.id}/cascade`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              newEndDate: newEnd,
              confirm: true,
              assumeOrdersSent: opts?.assumeOrdersSent?.map((o) => o.id),
            }),
          });
          if (!cascadeRes.ok) {
            // Surface conflicts (409) and real errors distinctly.
            if (cascadeRes.status === 409) {
              const data = await cascadeRes.json().catch(() => null);
              const msg = data?.conflicts?.length
                ? `Cannot pull forward: ${data.conflicts[0].kind === "job_in_past" ? "a downstream job would start in the past" : "an order would need placing in the past"}. Try a later start date.`
                : "Cannot pull forward — programme conflict.";
              toast.error(msg);
            } else {
              const errText = await cascadeRes.text();
              console.error("[CASCADE] FAILED:", cascadeRes.status, errText);
              toast.error(`Cascade failed: ${errText || `HTTP ${cascadeRes.status}`}`);
            }
            return;
          }
          const cascadeResult = await cascadeRes.json();
          console.log("[CASCADE] SUCCESS:", cascadeResult);
          if (Array.isArray(cascadeResult?.overriddenOrders)) {
            overriddenOrders = cascadeResult.overriddenOrders;
          }
        } else {
          console.warn("[CASCADE] No endDate — skipping cascade!");
        }
        await executeAction(job.id, "start", undefined, skipOrderProgression ? { skipOrderProgression: true } : undefined);
        setEarlyStartDialog(null);
        setSkipOrderProgression(false);
        // (#167) If the server flipped orders to ORDERED, open the
        // delivery follow-up prompt. Use supplierName from the original
        // override list when we have it so the rows are recognisable.
        if (overriddenOrders.length > 0) {
          const supplierById = new Map(
            (opts?.assumeOrdersSent ?? []).map((o) => [o.id, o.supplierName ?? null]),
          );
          setPendingDelivery(
            overriddenOrders.map((o) => ({ id: o.id, supplierName: supplierById.get(o.id) ?? null })),
          );
        }
      } catch (e) {
        console.error("[CASCADE] Exception:", e);
        toast.error(`Pull forward error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCascadeLoading(false);
      }
    },
    [executeAction, skipOrderProgression, toast]
  );

  const handlePullForward = useCallback(async () => {
    console.log("[CASCADE] handlePullForward called:", { earlyStartDialog, activeJob: activeJob?.id });
    if (!earlyStartDialog || !activeJob) {
      console.warn("[CASCADE] ABORTED — earlyStartDialog:", !!earlyStartDialog, "activeJob:", !!activeJob);
      return;
    }
    const { daysEarly, endDate } = earlyStartDialog;
    await executePullForward(activeJob, daysEarly, endDate);
  }, [earlyStartDialog, activeJob, executePullForward]);

  const handleExpandJob = useCallback(async () => {
    if (!activeJob) return;
    setCascadeLoading(true);
    try {
      await executeAction(activeJob.id, "start", undefined, skipOrderProgression ? { skipOrderProgression: true } : undefined);
      setEarlyStartDialog(null);
      setSkipOrderProgression(false);
    } finally {
      setCascadeLoading(false);
    }
  }, [activeJob, executeAction, skipOrderProgression]);

  const handlePullToNearestEvent = useCallback(async () => {
    if (!earlyStartDialog?.nearestEvent || !activeJob) return;
    const daysToShift = earlyStartDialog.nearestEvent.daysToEvent;
    await executePullForward(activeJob, daysToShift, earlyStartDialog.endDate);
  }, [earlyStartDialog, activeJob, executePullForward]);

  // ---- Custom-date pull forward ----
  // User picked a specific date. Compute the working-day delta from the
  // job's planned start to that date, preflight check, then apply if safe.
  const handlePullToCustomDate = useCallback(async () => {
    if (!earlyStartDialog || !activeJob || !activeJob.endDate || !customPullDate) return;
    const planned = new Date(activeJob.startDate ?? activeJob.endDate);
    planned.setHours(0, 0, 0, 0);
    const chosen = new Date(customPullDate);
    chosen.setHours(0, 0, 0, 0);
    const delta = differenceInWorkingDays(planned, chosen);
    if (delta <= 0) return; // No shift needed (chosen >= planned)
    await executePullForward(activeJob, delta, earlyStartDialog.endDate);
  }, [earlyStartDialog, activeJob, customPullDate, executePullForward]);

  // (#167) "Start anyway — mark order(s) sent" override for the custom
  // date in the Starting Early dialog. Only callable when the preflight
  // returned an order-only conflict.
  const handlePullToCustomDateOverride = useCallback(async () => {
    if (!earlyStartDialog || !activeJob || !activeJob.endDate || !customPullDate) return;
    const orders = customPullFeasibility?.overrideableOrders ?? [];
    if (orders.length === 0) return;
    const planned = new Date(activeJob.startDate ?? activeJob.endDate);
    planned.setHours(0, 0, 0, 0);
    const chosen = new Date(customPullDate);
    chosen.setHours(0, 0, 0, 0);
    const delta = differenceInWorkingDays(planned, chosen);
    if (delta <= 0) return;
    await executePullForward(activeJob, delta, earlyStartDialog.endDate, {
      assumeOrdersSent: orders,
    });
  }, [earlyStartDialog, activeJob, customPullDate, customPullFeasibility, executePullForward]);

  // Re-run preflight when user changes the custom date.
  useEffect(() => {
    if (!earlyStartDialog || !activeJob || !activeJob.endDate || !customPullDate || !activeJob.startDate) {
      setCustomPullFeasibility(null);
      return;
    }
    const planned = new Date(activeJob.startDate);
    planned.setHours(0, 0, 0, 0);
    const chosen = new Date(customPullDate);
    chosen.setHours(0, 0, 0, 0);
    const delta = differenceInWorkingDays(planned, chosen);
    if (delta <= 0) {
      // Chosen date is on/after planned start — nothing to do
      setCustomPullFeasibility(null);
      return;
    }
    setCustomPullFeasibility({ status: "checking" });
    let cancelled = false;
    (async () => {
      const result = await previewPullForward(activeJob.id, activeJob.endDate!, delta);
      if (cancelled) return;
      if (result.ok) {
        setCustomPullFeasibility({ status: "ok" });
      } else {
        // Earliest feasible START given THIS attempt: the user's chosen
        // date + the working-day gap that made the shift too aggressive.
        // (The server already anchors the gap at its own "today", which
        // matches our dev-date cookie.)
        const earliestStart = result.shiftGapDays && result.shiftGapDays > 0
          ? addWorkingDays(chosen, result.shiftGapDays)
          : null;
        setCustomPullFeasibility({
          status: "conflict",
          reason: result.reason,
          earliestStart,
          overrideableOrders: result.overrideableOrders ?? [],
        });
      }
    })();
    return () => { cancelled = true; };
  }, [customPullDate, earlyStartDialog, activeJob, previewPullForward]);

  const handlePreStartConfirm = useCallback(async () => {
    if (!preStartChecks || !activeJob) return;
    const { prevJob, undeliveredOrders, signOffPrev, markDelivered } =
      preStartChecks;
    setPreStartChecks(null);
    setPreStartLoading(true);
    try {
      if (signOffPrev && prevJob) {
        await fetch(`/api/jobs/${prevJob.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete" }),
        });
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
      }
      // Re-check early/late start after pre-start issues resolved
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayForward = isWorkingDay(today) ? today : snapToWorkingDay(today, "forward");
      if (activeJob.startDate) {
        const planned = new Date(activeJob.startDate);
        planned.setHours(0, 0, 0, 0);
        // daysEarly / daysLate are in WORKING days so they line up 1:1 with
        // the cascade engine's working-day delta.
        const daysEarly = differenceInWorkingDays(planned, todayForward);
        if (daysEarly > 0) {
          setEarlyStartDialog({ daysEarly, endDate: activeJob.endDate ?? null });
          return;
        }
        if (daysEarly < 0) {
          const daysLate = Math.abs(daysEarly);
          const originalDuration = activeJob.endDate
            ? differenceInWorkingDays(new Date(activeJob.endDate), new Date(activeJob.startDate))
            : 0;
          const compressedDuration = Math.max(0, originalDuration - daysLate);
          let cascadePreview: { jobCount: number; deltaDays: number } | null = null;
          if (activeJob.endDate) {
            try {
              const newEnd = addWorkingDays(new Date(activeJob.endDate), daysLate).toLocaleDateString("en-CA");
              const prev = await fetch(`/api/jobs/${activeJob.id}/cascade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEndDate: newEnd }),
              });
              if (prev.ok) {
                const data = await prev.json();
                cascadePreview = { jobCount: data.jobUpdates?.length || 0, deltaDays: daysLate };
              }
            } catch { /* non-critical */ }
          }
          setLateStartDialog({ daysLate, startDate: activeJob.startDate, endDate: activeJob.endDate ?? null, originalDuration, compressedDuration, cascadePreview });
          return;
        }
      }
      await executeAction(activeJob.id, "start", undefined, skipOrderProgression ? { skipOrderProgression: true } : undefined);
      setSkipOrderProgression(false);
    } catch (e) {
      console.error("Pre-start confirm failed:", e);
      toast.error(e instanceof Error ? `Pre-start check failed: ${e.message}` : "Pre-start check failed");
    } finally {
      setPreStartLoading(false);
    }
  }, [preStartChecks, activeJob, executeAction, skipOrderProgression, toast]);

  // ---- Late start handlers ----
  const handleLateStartPush = useCallback(async () => {
    if (!lateStartDialog || !activeJob) return;
    setCascadeLoading(true);
    try {
      if (activeJob.endDate) {
        // daysLate is in working days — shift end forward by that many WDs.
        const newEnd = addWorkingDays(new Date(activeJob.endDate), lateStartDialog.daysLate)
          .toLocaleDateString("en-CA");
        const cascadeRes = await fetch(`/api/jobs/${activeJob.id}/cascade`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
        });
        if (!cascadeRes.ok) {
          if (cascadeRes.status === 409) {
            const data = await cascadeRes.json().catch(() => null);
            toast.error(data?.conflicts?.length ? `Cannot push programme: ${data.conflicts[0].kind}` : "Programme shift conflict.");
          } else {
            const errText = await cascadeRes.text();
            console.error("Late start cascade failed:", errText);
            toast.error(`Late-start cascade failed: ${errText || `HTTP ${cascadeRes.status}`}`);
          }
          return;
        }
      }
      await executeAction(activeJob.id, "start", undefined, skipOrderProgression ? { skipOrderProgression: true } : undefined);
      setLateStartDialog(null);
      setSkipOrderProgression(false);
    } catch (e) {
      console.error("Late start push failed:", e);
      toast.error(e instanceof Error ? `Late-start failed: ${e.message}` : "Late-start failed");
    } finally {
      setCascadeLoading(false);
    }
  }, [lateStartDialog, activeJob, executeAction, skipOrderProgression]);

  const handleLateStartCompress = useCallback(async () => {
    if (!activeJob) return;
    setCascadeLoading(true);
    try {
      await executeAction(activeJob.id, "start", undefined, skipOrderProgression ? { skipOrderProgression: true } : undefined);
      setLateStartDialog(null);
      setSkipOrderProgression(false);
    } finally {
      setCascadeLoading(false);
    }
  }, [activeJob, executeAction, skipOrderProgression]);

  const handleLateStartBackdate = useCallback(async () => {
    if (!activeJob) return;
    setCascadeLoading(true);
    try {
      // Backdate: record the ORIGINAL planned start as actualStartDate
      // (not today, which is what Compress does)
      const extraBody: Record<string, unknown> = {
        ...(skipOrderProgression ? { skipOrderProgression: true } : {}),
        ...(activeJob.startDate ? { actualStartDate: activeJob.startDate } : {}),
      };
      await executeAction(
        activeJob.id,
        "start",
        undefined,
        Object.keys(extraBody).length > 0 ? extraBody : undefined
      );
      setLateStartDialog(null);
      setSkipOrderProgression(false);
    } finally {
      setCascadeLoading(false);
    }
  }, [activeJob, executeAction, skipOrderProgression]);


  // ---- Main entry point ----
  const triggerAction = useCallback(
    async (job: JobForAction, action: string, notes?: string) => {
      // Stop routes through a reason-capture dialog unless the caller
      // pre-supplies notes (e.g. programmatic/automated stop with context).
      if (action === "stop" && !notes) {
        setStopReason("");
        setStopDialog({ job });
        return;
      }
      if (action !== "start") {
        await executeAction(job.id, action, notes);
        return;
      }

      // Auto-fetch orders if caller didn't provide them — ensures every entry point gets order checks
      let jobWithOrders = job;
      if (!job.orders) {
        try {
          const orderRes = await fetch(`/api/jobs/${job.id}`);
          if (orderRes.ok) {
            const jobData = await orderRes.json();
            const orders = (jobData.orders ?? []).map((o: { id: string; status: string; supplier: { name: string }; expectedDeliveryDate?: string | null; dateOfOrder?: string | null }) => ({
              id: o.id, status: o.status, supplier: { name: o.supplier?.name || "Unknown" }, expectedDeliveryDate: o.expectedDeliveryDate ?? null, dateOfOrder: o.dateOfOrder ?? null,
            }));
            jobWithOrders = { ...job, orders };
          }
        } catch { /* non-critical — proceed without orders */ }
      }

      setActiveJob(jobWithOrders);
      console.log("[FLOW] triggerAction:", { jobId: jobWithOrders.id, name: jobWithOrders.name, startDate: jobWithOrders.startDate, endDate: jobWithOrders.endDate, orders: jobWithOrders.orders?.length });

      // 1. Check siblings for incomplete predecessor (by start date, not sortOrder)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let prevJob: { id: string; name: string } | null = null;
      try {
        const res = await fetch(`/api/jobs/${job.id}/siblings`);
        if (res.ok) {
          const { siblings } = await res.json();
          const current = siblings.find(
            (s: { id: string }) => s.id === job.id
          );
          if (current && current.endDate) {
            // A predecessor is a job that should END before this job STARTS
            const currentStart = current.startDate || current.endDate;
            const prev = [...siblings]
              .filter(
                (s: { id: string; endDate: string | null; status: string }) =>
                  s.id !== current.id &&
                  s.endDate &&
                  s.endDate < currentStart &&
                  s.status !== "COMPLETED"
              )
              .sort(
                (a: { endDate: string }, b: { endDate: string }) =>
                  b.endDate.localeCompare(a.endDate)
              )[0] ?? null;
            if (prev) prevJob = { id: prev.id, name: prev.name };
          }
        }
      } catch {
        // Non-critical
      }

      // 2. Check undelivered orders
      const undelivered = (jobWithOrders.orders ?? []).filter(
        (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED"
      );

      console.log("[FLOW] Pre-start:", { prevJob: prevJob?.name, undelivered: undelivered.length });
      if (prevJob || undelivered.length > 0) {
        console.log("[FLOW] Showing pre-start dialog");
        // Find the pull-forward option: shift programme so dateOfOrder lands on
        // the next working day (today if today is a working day, else the next
        // Monday). Uses working-day arithmetic throughout to match the cascade
        // engine — prevents "place today" → working-day-delta producing an
        // order date in the past.
        let nearestEvent: { date: string; supplierName: string; label: string; alreadyTimed?: boolean } | null = null;
        const eventDates: Array<{ date: Date; supplierName: string; label: string; alreadyTimed: boolean }> = [];
        const todayForward = isWorkingDay(today) ? today : snapToWorkingDay(today, "forward");
        for (const o of undelivered) {
          if (o.status === "PENDING" && o.dateOfOrder) {
            const orderDate = new Date(o.dateOfOrder);
            if (jobWithOrders.startDate) {
              const jobStart = new Date(jobWithOrders.startDate);
              // Preserve the order→job gap in WORKING days (matches cascade).
              const gapWD = differenceInWorkingDays(jobStart, orderDate);
              const newJobStart = addWorkingDays(todayForward, gapWD);
              // If the existing dateOfOrder is already on or before today's
              // snapped working day, pulling forward would be a no-op / would
              // move order into the past. Mark as alreadyTimed so the UI can
              // show a grey "already perfectly timed" chip instead of hiding.
              const alreadyTimed = orderDate.getTime() <= todayForward.getTime();
              eventDates.push({
                alreadyTimed,
                date: newJobStart,
                supplierName: o.supplier.name,
                label: `${o.supplier.name} order — place today, start ${format(newJobStart, "dd MMM")}`,
              });
            }
          } else if (o.status === "ORDERED" && o.expectedDeliveryDate) {
            const d = new Date(o.expectedDeliveryDate);
            if (d > today) eventDates.push({ alreadyTimed: false, date: d, supplierName: o.supplier.name, label: `${o.supplier.name} delivery on ${format(d, "dd MMM")}` });
          }
        }
        if (eventDates.length > 0) {
          eventDates.sort((a, b) => a.date.getTime() - b.date.getTime());
          const first = eventDates[0];
          nearestEvent = { date: first.date.toISOString(), supplierName: first.supplierName, label: first.label, alreadyTimed: first.alreadyTimed };
        }

        setPreStartChecks({
          prevJob,
          undeliveredOrders: undelivered.map((o) => ({
            id: o.id,
            supplier: o.supplier.name,
            status: o.status,
            expectedDeliveryDate: o.expectedDeliveryDate,
            dateOfOrder: o.dateOfOrder,
          })),
          nearestEvent,
          signOffPrev: false,
          markDelivered: false,
        });
        return;
      }

      // 3. Early-start or late-start check (working days — matches cascade)
      const todayFwd = isWorkingDay(today) ? today : snapToWorkingDay(today, "forward");
      if (jobWithOrders.startDate) {
        const planned = new Date(jobWithOrders.startDate);
        planned.setHours(0, 0, 0, 0);
        const daysEarly = differenceInWorkingDays(planned, todayFwd);
        console.log("[FLOW] Early/late check:", { daysEarly, startDate: jobWithOrders.startDate, endDate: jobWithOrders.endDate });
        if (daysEarly > 0) {
          console.log("[FLOW] Showing early start dialog:", daysEarly, "days early");
          // Find nearest upcoming event on this plot (order delivery or job start)
          let nearestEvent: { date: string; label: string; daysToEvent: number } | null = null;
          try {
            const siblingsRes = await fetch(`/api/jobs/${jobWithOrders.id}/siblings`);
            if (siblingsRes.ok) {
              const { siblings } = await siblingsRes.json();
              const events: { date: Date; label: string }[] = [];
              for (const sib of siblings) {
                if (sib.id === jobWithOrders.id) continue;
                // Upcoming job starts
                if (sib.startDate && sib.status === "NOT_STARTED") {
                  const d = new Date(sib.startDate);
                  if (d > today && d < planned) events.push({ date: d, label: `${sib.name} starts` });
                }
              }
              // Check order delivery dates for the current job
              for (const order of (jobWithOrders.orders ?? [])) {
                if (order.status !== "DELIVERED" && order.status !== "CANCELLED") {
                  try {
                    const orderRes = await fetch(`/api/orders/${order.id}`);
                    if (orderRes.ok) {
                      const orderData = await orderRes.json();
                      if (orderData.expectedDeliveryDate) {
                        const d = new Date(orderData.expectedDeliveryDate);
                        if (d > today && d < planned) events.push({ date: d, label: `${order.supplier.name} delivery` });
                      }
                    }
                  } catch { /* non-critical */ }
                }
              }
              if (events.length > 0) {
                events.sort((a, b) => a.date.getTime() - b.date.getTime());
                const nearest = events[0];
                nearestEvent = {
                  date: nearest.date.toISOString(),
                  label: nearest.label,
                  daysToEvent: differenceInWorkingDays(planned, nearest.date),
                };
              }
            }
          } catch { /* non-critical */ }
          setEarlyStartDialog({ daysEarly, endDate: jobWithOrders.endDate ?? null, nearestEvent });
          return;
        }
        if (daysEarly < 0) {
          const daysLate = Math.abs(daysEarly);
          const originalDuration = jobWithOrders.endDate
            ? differenceInWorkingDays(new Date(jobWithOrders.endDate), new Date(jobWithOrders.startDate))
            : 0;
          const compressedDuration = Math.max(0, originalDuration - daysLate);

          // Fetch cascade preview
          let cascadePreview: { jobCount: number; deltaDays: number } | null = null;
          if (jobWithOrders.endDate) {
            try {
              const newEnd = addWorkingDays(new Date(jobWithOrders.endDate), daysLate).toLocaleDateString("en-CA");
              const prev = await fetch(`/api/jobs/${jobWithOrders.id}/cascade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEndDate: newEnd }),
              });
              if (prev.ok) {
                const data = await prev.json();
                cascadePreview = { jobCount: data.jobUpdates?.length || 0, deltaDays: daysLate };
              }
            } catch { /* non-critical */ }
          }

          setLateStartDialog({
            daysLate,
            startDate: jobWithOrders.startDate,
            endDate: jobWithOrders.endDate ?? null,
            originalDuration,
            compressedDuration,
            cascadePreview,
          });
          return;
        }
      }

      await executeAction(jobWithOrders.id, "start");
    },
    [executeAction]
  );

  // ---- Dialogs JSX ----
  const dialogs = (
    <>
      {/* Pre-start checks */}
      <Dialog
        open={!!preStartChecks}
        onOpenChange={(o) => {
          if (!o) { setPreStartChecks(null); setActiveJob(null); }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              Before You Start
            </DialogTitle>
            <DialogDescription>
              Review these items before starting{" "}
              <span className="font-medium">{activeJob?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {preStartChecks?.prevJob && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={preStartChecks.signOffPrev}
                  onChange={() =>
                    setPreStartChecks((prev) =>
                      prev ? { ...prev, signOffPrev: !prev.signOffPrev } : prev
                    )
                  }
                  className="mt-0.5 size-4 rounded"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Previous job not signed off
                  </p>
                  <p className="text-xs text-amber-600">
                    <span className="font-medium">
                      {preStartChecks.prevJob.name}
                    </span>{" "}
                    is still in progress. Tick to sign it off now.
                  </p>
                </div>
              </label>
            )}
            {preStartChecks && preStartChecks.undeliveredOrders.length > 0 && (
              <div className="space-y-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800">
                    {preStartChecks.undeliveredOrders.length} order{preStartChecks.undeliveredOrders.length !== 1 ? "s" : ""} not yet on site
                  </p>
                  {preStartChecks.undeliveredOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded border border-amber-200 bg-white px-2 py-1.5 text-xs">
                      <div>
                        <span className="font-medium">{o.supplier}</span>
                        <span className="ml-1 text-amber-600">— {o.status === "PENDING" ? "not placed" : "awaiting delivery"}</span>
                      </div>
                      {o.status === "PENDING" && (
                        <div className="flex gap-1">
                          <button onClick={async () => {
                            // Mark Sent records the actual placement date (today)
                            // so Daily Brief / Budget / Cash-flow downstream views
                            // see when the order was actually placed vs the template
                            // default date.
                            await fetch(`/api/orders/${o.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                status: "ORDERED",
                                dateOfOrder: new Date().toISOString(),
                              }),
                            });
                            o.status = "ORDERED";
                            setPreStartChecks({ ...preStartChecks });
                          }} className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100">
                            Mark Sent
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Option 1: Start today — resolve orders now */}
                <button
                  onClick={() => {
                    setPreStartChecks(null);
                    setOrderResolution({
                      orders: preStartChecks.undeliveredOrders,
                      resolved: new Set(),
                    });
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-left hover:border-blue-400 transition-colors"
                >
                  <span className="mt-0.5 text-lg">📦</span>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Start today — resolve orders now</p>
                    <p className="text-xs text-blue-600">You will need to confirm each order is sent and materials are on site before proceeding</p>
                  </div>
                </button>

                {/* Option 2: Pick a start date */}
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg">📅</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-800">Pick a start date</p>
                      <p className="text-xs text-emerald-600 mb-2">Choose when to start — programme will shift to match</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          min={new Date().toLocaleDateString("en-CA")}
                          className="rounded border bg-white px-2 py-1 text-sm"
                          onChange={(e) => {
                            if (!e.target.value || !activeJob) return;
                            const picked = new Date(e.target.value);
                            const planned = activeJob.startDate ? new Date(activeJob.startDate) : null;
                            if (planned) {
                              // Working-day delta — matches cascade engine.
                              const pickedFwd = isWorkingDay(picked) ? picked : snapToWorkingDay(picked, "forward");
                              const deltaWD = differenceInWorkingDays(pickedFwd, planned);
                              if (deltaWD !== 0 && activeJob.endDate) {
                                const newEnd = addWorkingDays(new Date(activeJob.endDate), deltaWD).toLocaleDateString("en-CA");
                                setPreStartChecks(null);
                                setCascadeLoading(true);
                                toast.info("Shifting programme…");
                                fetch(`/api/jobs/${activeJob.id}/cascade`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
                                }).then(async (res) => {
                                  if (res.ok) {
                                    const data = await res.json().catch(() => ({ jobsUpdated: 0, deltaDays: deltaWD }));
                                    toast.success(`Programme shifted to start ${format(pickedFwd, "dd MMM")} — ${data.jobsUpdated} job${data.jobsUpdated !== 1 ? "s" : ""} updated`);
                                    await executeAction(activeJob.id, "start");
                                  } else if (res.status === 409) {
                                    const data = await res.json().catch(() => null);
                                    toast.error(data?.conflicts?.length ? `Cannot shift to that date: ${data.conflicts[0].kind === "job_in_past" ? "would put a job in the past" : "would require placing an order in the past"}.` : "Cannot shift to that date.");
                                  } else {
                                    const err = await res.json().catch(() => null);
                                    toast.error(err?.error ?? `Cascade failed (HTTP ${res.status})`);
                                  }
                                  setCascadeLoading(false);
                                  setActiveJob(null);
                                }).catch((e) => {
                                  setCascadeLoading(false);
                                  toast.error(e instanceof Error ? e.message : "Cascade failed");
                                });
                              } else {
                                setPreStartChecks(null);
                                executeAction(activeJob.id, "start").then(() => setActiveJob(null));
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Option 3: Pull forward to next event (order date or delivery date).
                    When the order is already scheduled on or before today's next
                    working day, pulling forward would be a no-op (or require
                    ordering in the past). Show a disabled "already perfectly
                    timed" chip instead of hiding so users understand the state. */}
                {preStartChecks.nearestEvent && activeJob && preStartChecks.nearestEvent.alreadyTimed && (
                  <div className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left opacity-70">
                    <span className="mt-0.5 text-lg">✅</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Already perfectly timed
                      </p>
                      <p className="text-xs text-slate-500">
                        This order is already scheduled to be placed today (or earlier) — no pull-forward available. Use &ldquo;Start today&rdquo; above to send the order and begin.
                      </p>
                    </div>
                  </div>
                )}
                {preStartChecks.nearestEvent && activeJob && !preStartChecks.nearestEvent.alreadyTimed && (() => {
                  // Pre-compute the delta once so we can both label the button
                  // with it and decide whether it's a no-op (in which case we
                  // render a grey "already timed" chip instead).
                  const targetDate = new Date(preStartChecks.nearestEvent.date);
                  const plannedPreview = activeJob.startDate ? new Date(activeJob.startDate) : null;
                  const deltaWDPreview = plannedPreview
                    ? differenceInWorkingDays(targetDate, plannedPreview)
                    : 0;
                  // If the delta is zero (order already matches today's working-
                  // day gap) show the grey chip — no cascade needed.
                  if (deltaWDPreview === 0) {
                    return (
                      <div className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left opacity-80">
                        <span className="mt-0.5 text-lg">✅</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            Already perfectly timed
                          </p>
                          <p className="text-xs text-slate-500">
                            The order is already scheduled for the right working day — pull-forward would make no change. Use &ldquo;Start today&rdquo; above to send the order and begin, or &ldquo;Pick a start date&rdquo; to reschedule.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  // Non-zero delta: render the actual pull-forward button.
                  const direction = deltaWDPreview < 0 ? "earlier" : "later";
                  return (
                    <button
                      onClick={() => {
                        if (!activeJob || !preStartChecks.nearestEvent) return;
                        const planned = activeJob.startDate ? new Date(activeJob.startDate) : null;
                        if (planned && activeJob.endDate) {
                          const deltaWD = differenceInWorkingDays(targetDate, planned);
                          const newEnd = addWorkingDays(new Date(activeJob.endDate), deltaWD).toLocaleDateString("en-CA");
                          setPreStartChecks(null);
                          setCascadeLoading(true);
                          toast.info("Shifting programme…");
                          fetch(`/api/jobs/${activeJob.id}/cascade`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
                          }).then(async (res) => {
                            if (res.ok) {
                              const data = await res.json().catch(() => ({ jobsUpdated: 0, deltaDays: deltaWD }));
                              toast.success(`Programme shifted ${Math.abs(data.deltaDays)} working day${Math.abs(data.deltaDays) !== 1 ? "s" : ""} ${data.deltaDays < 0 ? "earlier" : "later"} — ${data.jobsUpdated} job${data.jobsUpdated !== 1 ? "s" : ""} updated`);
                              await executeAction(activeJob.id, "start");
                            } else if (res.status === 409) {
                              const data = await res.json().catch(() => null);
                              const msg = data?.conflicts?.length
                                ? `Cannot pull forward: ${data.conflicts[0].kind === "job_in_past" ? "a downstream job would start in the past" : "an order would need placing in the past"}. Try a later start date.`
                                : "Cannot pull forward — programme conflict.";
                              toast.error(msg);
                            } else {
                              const err = await res.json().catch(() => null);
                              toast.error(err?.error ?? `Cascade failed (HTTP ${res.status})`);
                            }
                            setCascadeLoading(false);
                            setActiveJob(null);
                          }).catch((e) => {
                            setCascadeLoading(false);
                            toast.error(e instanceof Error ? e.message : "Cascade failed");
                          });
                        }
                      }}
                      disabled={preStartLoading}
                      className="flex w-full items-start gap-3 rounded-xl border-2 border-purple-200 bg-purple-50 px-4 py-3 text-left hover:border-purple-400 transition-colors"
                    >
                      <span className="mt-0.5 text-lg">🎯</span>
                      <div>
                        <p className="text-sm font-semibold text-purple-800">
                          Pull forward — {preStartChecks.nearestEvent.label}
                        </p>
                        <p className="text-xs text-purple-600">
                          Programme shifts {Math.abs(deltaWDPreview)} working day{Math.abs(deltaWDPreview) !== 1 ? "s" : ""} {direction} — order placed today
                        </p>
                      </div>
                    </button>
                  );
                })()}

                {/* Option 4: Skip order check */}
                <button
                  onClick={() => { setSkipOrderProgression(true); handlePreStartConfirm(); }}
                  disabled={preStartLoading}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-slate-400 transition-colors"
                >
                  <span className="mt-0.5 text-lg">⚡</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Start anyway — I will handle orders separately</p>
                    <p className="text-xs text-slate-500">Orders remain unresolved — you can manage them from the Daily Brief</p>
                  </div>
                </button>
              </div>
            )}
            {/* If only predecessor issue, no orders */}
            {preStartChecks && preStartChecks.undeliveredOrders.length === 0 && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setPreStartChecks(null); setActiveJob(null); }}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePreStartConfirm}
                  disabled={preStartLoading}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {preStartLoading && <Loader2 className="inline size-3.5 animate-spin mr-1" />}
                  Start Anyway
                </button>
              </div>
            )}
            {/* Cancel for order scenarios */}
            {preStartChecks && preStartChecks.undeliveredOrders.length > 0 && (
              <button
                onClick={() => { setPreStartChecks(null); setActiveJob(null); }}
                className="w-full rounded-xl border px-4 py-2 text-sm text-muted-foreground hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Order resolution — forced step-by-step */}
      <Dialog
        open={!!orderResolution}
        onOpenChange={(o) => {
          if (!o) { setOrderResolution(null); setActiveJob(null); }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-blue-500" />
              Resolve Orders
            </DialogTitle>
            <DialogDescription>
              Confirm each order before starting <span className="font-medium">{activeJob?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          {orderResolution && (
            <div className="space-y-2">
              {orderResolution.orders.map((order) => {
                const isResolved = orderResolution.resolved.has(order.id);
                const isPending = order.status === "PENDING";
                return (
                  <div key={order.id} className={`rounded-xl border p-3 ${isResolved ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{order.supplier}</p>
                        <p className="text-xs text-muted-foreground">
                          {isPending ? "Not yet ordered" : "Ordered — awaiting delivery"}
                        </p>
                      </div>
                      {isResolved ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Resolved</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {isPending && (
                            <button
                              onClick={async () => {
                                await fetch(`/api/orders/${order.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    status: "ORDERED",
                                    dateOfOrder: new Date().toISOString(),
                                  }),
                                });
                                setOrderResolution((prev) => prev ? { ...prev, resolved: new Set(prev.resolved).add(order.id) } : prev);
                              }}
                              className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                            >
                              Mark Sent
                            </button>
                          )}
                          {isPending && (
                            <button
                              onClick={async () => {
                                // Fetch full order to build email
                                const orderRes = await fetch(`/api/orders/${order.id}`);
                                if (orderRes.ok) {
                                  const orderData = await orderRes.json();
                                  const { buildOrderMailto } = await import("@/lib/order-email");
                                  if (orderData.supplier?.contactEmail) {
                                    const mailto = buildOrderMailto(orderData.supplier.contactEmail, {
                                      supplierName: orderData.supplier.name,
                                      supplierContactName: orderData.supplier.contactName,
                                      supplierAccountNumber: orderData.supplier.accountNumber,
                                      jobName: orderData.job?.name || activeJob?.name || "",
                                      siteName: orderData.job?.plot?.site?.name || "",
                                      siteAddress: orderData.job?.plot?.site?.address || "",
                                      sitePostcode: orderData.job?.plot?.site?.postcode || "",
                                      plotNumbers: [orderData.job?.plot?.plotNumber ? `Plot ${orderData.job.plot.plotNumber}` : ""],
                                      items: (orderData.orderItems || []).map((i: { name: string; quantity: number; unit: string; unitCost: number }) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
                                      itemsDescriptionFallback: orderData.itemsDescription,
                                      expectedDeliveryDate: orderData.expectedDeliveryDate,
                                      orderDate: new Date().toISOString(),
                                      urgentDelivery: true,
                                    });
                                    window.open(mailto, "_blank");
                                  }
                                }
                                // Mark as ORDERED with actual placement date
                                await fetch(`/api/orders/${order.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    status: "ORDERED",
                                    dateOfOrder: new Date().toISOString(),
                                  }),
                                });
                                setOrderResolution((prev) => prev ? { ...prev, resolved: new Set(prev.resolved).add(order.id) } : prev);
                              }}
                              className="rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600"
                            >
                              Send Order
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await fetch(`/api/orders/${order.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DELIVERED" }) });
                              setOrderResolution((prev) => prev ? { ...prev, resolved: new Set(prev.resolved).add(order.id) } : prev);
                            }}
                            className="rounded bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700"
                          >
                            On Site
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setOrderResolution(null); setActiveJob(null); }}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    // Check if any orders were resolved as ORDERED (not DELIVERED)
                    // If so, find earliest delivery date to use as pull target
                    let targetDate: string | null = null;
                    const orderedButNotDelivered = orderResolution?.orders.filter(
                      (o) => orderResolution.resolved.has(o.id) && o.status !== "DELIVERED"
                    ) ?? [];
                    if (orderedButNotDelivered.length > 0) {
                      // Fetch delivery dates for these orders
                      const deliveryDates: Date[] = [];
                      for (const o of orderedButNotDelivered) {
                        try {
                          const res = await fetch(`/api/orders/${o.id}`);
                          if (res.ok) {
                            const data = await res.json();
                            if (data.expectedDeliveryDate) deliveryDates.push(new Date(data.expectedDeliveryDate));
                          }
                        } catch { /* non-critical */ }
                      }
                      if (deliveryDates.length > 0) {
                        deliveryDates.sort((a, b) => a.getTime() - b.getTime());
                        targetDate = deliveryDates[0].toISOString();
                      }
                    }

                    setOrderResolution(null);
                    if (!activeJob) return;
                    // Go directly to early/late start check (working days)
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const todayFwd2 = isWorkingDay(today) ? today : snapToWorkingDay(today, "forward");
                    if (activeJob.startDate) {
                      const planned = new Date(activeJob.startDate);
                      planned.setHours(0, 0, 0, 0);
                      const daysEarly = differenceInWorkingDays(planned, todayFwd2);
                      if (daysEarly > 0) {
                        if (targetDate) {
                          // Pull to delivery date instead of today
                          const deliveryDate = new Date(targetDate);
                          const daysToDelivery = differenceInWorkingDays(planned, deliveryDate);
                          setEarlyStartDialog({
                            daysEarly,
                            endDate: activeJob.endDate ?? null,
                            targetDate,
                            nearestEvent: daysToDelivery > 0 ? { date: targetDate, label: "expected delivery", daysToEvent: daysToDelivery } : null,
                          });
                        } else {
                          setEarlyStartDialog({ daysEarly, endDate: activeJob.endDate ?? null });
                        }
                        return;
                      }
                      if (daysEarly < 0) {
                        const daysLate = Math.abs(daysEarly);
                        const originalDuration = activeJob.endDate
                          ? differenceInWorkingDays(new Date(activeJob.endDate), new Date(activeJob.startDate))
                          : 0;
                        setLateStartDialog({ daysLate, startDate: activeJob.startDate, endDate: activeJob.endDate ?? null, originalDuration, compressedDuration: Math.max(0, originalDuration - daysLate), cascadePreview: null });
                        return;
                      }
                    }
                    await executeAction(activeJob.id, "start");
                    setActiveJob(null);
                  }}
                  disabled={orderResolution.resolved.size < orderResolution.orders.length}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Early-start programme impact */}
      <Dialog
        open={!!earlyStartDialog}
        onOpenChange={(o) => {
          if (!o) { setEarlyStartDialog(null); setActiveJob(null); }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>Starting Early</DialogTitle>
            <DialogDescription>
              {earlyStartDialog && (
                <>
                  <span className="font-medium">{activeJob?.name}</span> is
                  planned to start in{" "}
                  <span className="font-semibold text-blue-600">
                    {earlyStartDialog.daysEarly} working day
                    {earlyStartDialog.daysEarly !== 1 ? "s" : ""}
                  </span>
                  . How would you like to handle the programme?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {earlyStartDialog && (
            <div className="space-y-2">
              {/* Unified Pull Forward — one section. Date picker defaults to
                  today (= pull fully forward, old "Pull Programme Forward"
                  button). User can nudge later if a full pull hits a
                  downstream conflict. Preflight runs on every change. */}
              {activeJob?.startDate && activeJob?.endDate && (() => {
                // Local-time formatting — toISOString() was producing
                // yesterday's date in BST (UTC+1) so the min/max and
                // default value all came out one day early.
                const todayISO = format(new Date(), "yyyy-MM-dd");
                const plannedISO = format(new Date(activeJob.startDate), "yyyy-MM-dd");
                const atPlanned = customPullDate === plannedISO;
                const atToday = customPullDate === todayISO;
                return (
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-lg">⏩</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-blue-800">
                          Pull Programme Forward
                        </p>
                        <p className="text-xs text-blue-600">
                          Choose a start date — defaults to today. Everything
                          downstream shifts by the same number of working days.
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="date"
                            value={customPullDate}
                            min={todayISO}
                            max={plannedISO}
                            onChange={(e) => setCustomPullDate(e.target.value)}
                            disabled={cascadeLoading}
                            className="flex-1 rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="default"
                            disabled={
                              cascadeLoading ||
                              !customPullDate ||
                              atPlanned ||
                              customPullFeasibility?.status === "checking" ||
                              customPullFeasibility?.status === "conflict"
                            }
                            onClick={handlePullToCustomDate}
                            className="h-8"
                          >
                            Apply
                          </Button>
                        </div>
                        {/* Quick reset-to-today button if user bumped the
                            date and wants to snap back. */}
                        {!atToday && (
                          <button
                            type="button"
                            onClick={() => setCustomPullDate(todayISO)}
                            className="mt-1.5 text-[11px] text-blue-700 underline hover:text-blue-900"
                          >
                            Reset to today
                          </button>
                        )}
                        {customPullFeasibility?.status === "checking" && (
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-500">
                            <Loader2 className="size-2.5 animate-spin" /> Checking…
                          </p>
                        )}
                        {customPullFeasibility?.status === "ok" && (
                          <p className="mt-1.5 text-[11px] font-medium text-emerald-600">
                            ✓ Safe to pull to this date
                          </p>
                        )}
                        {customPullFeasibility?.status === "conflict" && (
                          <p className="mt-1.5 text-[11px] font-medium text-red-600">
                            {customPullFeasibility.reason}{" "}
                            {customPullFeasibility.earliestStart ? (
                              <>
                                Earliest allowed:{" "}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCustomPullDate(
                                      format(customPullFeasibility.earliestStart!, "yyyy-MM-dd")
                                    )
                                  }
                                  className="font-semibold underline hover:text-red-800"
                                  title="Click to use this date"
                                >
                                  {format(customPullFeasibility.earliestStart, "EEE d MMM")}
                                </button>
                                .
                              </>
                            ) : (
                              "Try a later date."
                            )}
                          </p>
                        )}
                        {/* (#167) "Start anyway — mark order(s) sent"
                            override. Only when ALL blockers are PENDING
                            orders. */}
                        {customPullFeasibility?.status === "conflict" &&
                          (customPullFeasibility.overrideableOrders?.length ?? 0) > 0 && (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                              <p className="mb-1.5 text-[11px] text-amber-800">
                                Start on this day anyway? The{" "}
                                {customPullFeasibility.overrideableOrders!.length === 1
                                  ? "blocking order"
                                  : `${customPullFeasibility.overrideableOrders!.length} blocking orders`}{" "}
                                will be marked as sent today and you&apos;ll set
                                the delivery status next.
                              </p>
                              <Button
                                size="sm"
                                className="h-7 w-full bg-amber-600 text-xs hover:bg-amber-700"
                                disabled={cascadeLoading}
                                onClick={handlePullToCustomDateOverride}
                              >
                                {cascadeLoading ? (
                                  <Loader2 className="size-3 animate-spin" aria-hidden />
                                ) : (
                                  <Truck className="size-3" aria-hidden />
                                )}
                                Start anyway — mark{" "}
                                {customPullFeasibility.overrideableOrders!.length === 1
                                  ? "order"
                                  : "orders"}{" "}
                                sent
                              </Button>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={handleExpandJob}
                disabled={cascadeLoading}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3.5 text-left hover:border-emerald-400 hover:bg-emerald-100 transition-colors disabled:opacity-60"
              >
                <span className="mt-0.5 text-lg">📐</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Expand This Job
                  </p>
                  <p className="text-xs text-emerald-600">
                    Start now, keep the planned end date — rest of programme
                    stays put.
                  </p>
                </div>
              </button>
              {earlyStartDialog?.nearestEvent && (
                <button
                  onClick={handlePullToNearestEvent}
                  disabled={cascadeLoading}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-purple-200 bg-purple-50 px-4 py-3.5 text-left hover:border-purple-400 hover:bg-purple-100 transition-colors disabled:opacity-60"
                >
                  <span className="mt-0.5 text-lg">🎯</span>
                  <div>
                    <p className="text-sm font-semibold text-purple-800">
                      Pull to Next Event
                    </p>
                    <p className="text-xs text-purple-600">
                      Shift to align with {earlyStartDialog.nearestEvent.label} ({earlyStartDialog.nearestEvent.daysToEvent} working day{earlyStartDialog.nearestEvent.daysToEvent !== 1 ? "s" : ""} from now).
                    </p>
                  </div>
                </button>
              )}

              <button
                onClick={() => { setEarlyStartDialog(null); setActiveJob(null); }}
                disabled={cascadeLoading}
                className="w-full rounded-xl border border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              {cascadeLoading && (
                <div className="flex items-center justify-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Updating
                  programme…
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Order date conflict warning */}
      <Dialog
        open={!!orderConflictDialog}
        onOpenChange={(o) => {
          if (!o) setOrderConflictDialog(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="size-4" /> Order Date Conflict
            </DialogTitle>
            <DialogDescription>
              Pulling the programme forward would push these order dates into
              the past. These orders may need to be re-placed.
            </DialogDescription>
          </DialogHeader>
          {orderConflictDialog && (
            <div className="space-y-3">
              <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                {orderConflictDialog.conflicts.map((c, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-semibold text-amber-900">{c.jobName}</p>
                    <p className="text-amber-700">
                      Order: {c.orderDate} →{" "}
                      <span className="font-medium text-red-600">
                        {c.newOrderDate}
                      </span>
                    </p>
                    {c.newDeliveryDate && (
                      <p className="text-amber-700">
                        Delivery: {c.deliveryDate ?? "—"} →{" "}
                        <span className="font-medium text-red-600">
                          {c.newDeliveryDate}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={orderConflictDialog.onConfirm}
                  className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
                >
                  Pull Forward Anyway
                </button>
                <button
                  onClick={() => setOrderConflictDialog(null)}
                  className="flex-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Late start programme impact */}
      <Dialog
        open={!!lateStartDialog}
        onOpenChange={(o) => {
          if (!o) { setLateStartDialog(null); setActiveJob(null); }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="size-5" />
              Starting Late
            </DialogTitle>
            <DialogDescription>
              {activeJob?.name} was planned to start {lateStartDialog?.daysLate} day
              {lateStartDialog?.daysLate !== 1 ? "s" : ""} ago. How would you like
              to handle the programme?
            </DialogDescription>
          </DialogHeader>
          {lateStartDialog && (
            <div className="space-y-2 py-2">
              {/* Option A: Push programme */}
              <button
                className="w-full rounded-lg border-2 border-amber-200 bg-amber-50 p-3 text-left transition hover:border-amber-400 disabled:opacity-50"
                onClick={handleLateStartPush}
                disabled={cascadeLoading}
              >
                <p className="text-sm font-semibold text-amber-800">Start from Today, Push Programme</p>
                <p className="text-xs text-amber-700">
                  Shift end date and all downstream jobs forward by {lateStartDialog.daysLate} day
                  {lateStartDialog.daysLate !== 1 ? "s" : ""}
                </p>
                {lateStartDialog.cascadePreview && lateStartDialog.cascadePreview.jobCount > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-amber-600">
                    {lateStartDialog.cascadePreview.jobCount} downstream job
                    {lateStartDialog.cascadePreview.jobCount !== 1 ? "s" : ""} will shift
                  </p>
                )}
              </button>

              {/* Option B: Compress duration */}
              <button
                className="w-full rounded-lg border-2 border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-400 disabled:opacity-50"
                onClick={handleLateStartCompress}
                disabled={cascadeLoading}
              >
                <p className="text-sm font-semibold text-blue-800">Start from Today, Compress Duration</p>
                <p className="text-xs text-blue-700">
                  Keep original end date — programme stays on track
                </p>
                {lateStartDialog.originalDuration > 0 && (
                  <p className={`mt-1 text-[11px] font-medium ${lateStartDialog.compressedDuration < lateStartDialog.originalDuration * 0.5 ? "text-red-600" : "text-blue-600"}`}>
                    Duration compressed from {lateStartDialog.originalDuration} to {lateStartDialog.compressedDuration} day
                    {lateStartDialog.compressedDuration !== 1 ? "s" : ""}
                    {lateStartDialog.compressedDuration < lateStartDialog.originalDuration * 0.5 && " — significantly reduced"}
                  </p>
                )}
              </button>

              {/* Option C: Backdate */}
              <button
                className="w-full rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-400 disabled:opacity-50"
                onClick={handleLateStartBackdate}
                disabled={cascadeLoading}
              >
                <p className="text-sm font-semibold text-emerald-800">Start from Original Date</p>
                <p className="text-xs text-emerald-700">
                  Record original start date — no programme impact
                </p>
              </button>

              {cascadeLoading && (
                <div className="flex items-center justify-center gap-2 pt-1 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Updating programme...
                </div>
              )}

              <button
                className="w-full rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-slate-50"
                onClick={() => { setLateStartDialog(null); setActiveJob(null); }}
                disabled={cascadeLoading}
              >
                Cancel
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stop-reason dialog — fires before any stop action so the user's
          decision is captured (what's blocking this job?) at the moment
          it happens, not inferred later from the event log. */}
      <Dialog
        open={!!stopDialog}
        onOpenChange={(o) => { if (!o) { setStopDialog(null); setStopReason(""); } }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Stop Job</DialogTitle>
            <DialogDescription>
              Put <span className="font-medium">{stopDialog?.job.name}</span> on hold.
              Leave a short note explaining why so anyone checking later knows the reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="stop-reason" className="text-sm">Reason</Label>
            <Textarea
              id="stop-reason"
              autoFocus
              value={stopReason}
              onChange={(e) => setStopReason(e.target.value)}
              placeholder="e.g. Waiting for materials / Weather too cold for pour / Contractor no-show"
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setStopDialog(null); setStopReason(""); }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isLoading || !stopReason.trim()}
              onClick={async () => {
                const job = stopDialog?.job;
                if (!job) return;
                const notes = stopReason.trim();
                setStopDialog(null);
                setStopReason("");
                await executeAction(job.id, "stop", notes);
              }}
            >
              {isLoading ? <><Loader2 className="size-3.5 animate-spin" /> Stopping…</> : "Stop Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* (#167) Delivery follow-up after "Start anyway — mark order(s) sent" */}
      <OrderDeliveryFollowUpDialog
        orders={pendingDelivery}
        onClose={() => setPendingDelivery(null)}
      />
    </>
  );

  return {
    /** Full pre-start flow — use for "Start" buttons. Opens dialogs for
     *  pre-start checks, early/late start, order resolution. */
    triggerAction,
    /** Lightweight job-action runner — no dialogs, no pre-start checks.
     *  Use for stop / complete / signoff / note buttons that shouldn't
     *  walk through the pre-start flow. Returns a result so the caller
     *  can react to success/failure. */
    runSimpleAction,
    /** Preview a cascade without applying. Used by walkthrough's
     *  "Preview Impact" button. */
    previewCascade,
    isLoading: isLoading || preStartLoading || cascadeLoading,
    dialogs,
  };
}
