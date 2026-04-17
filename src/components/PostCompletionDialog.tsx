"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  PlayCircle,
  CalendarDays,
  Clock,
  PauseCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  HardHat,
  User,
  AlertTriangle,
  Package,
  Mail,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NextJobOrder {
  id: string;
  status: string;
  itemsDescription: string | null;
  expectedDeliveryDate: string | null;
  supplierName: string;
  supplierEmail: string | null;
  supplierContactName: string | null;
}

interface NextJob {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  contractorName: string | null;
  contractorEmail?: string | null;
  contractorPhone?: string | null;
  assignedToName: string | null;
  orders?: NextJobOrder[];
}

interface PostCompletionDialogProps {
  open: boolean;
  completedJobName: string;
  daysDeviation: number;
  nextJob: NextJob | null;
  plotId: string;
  signOffNotes?: string;
  onClose: () => void;
  onDecisionMade: () => void;
}

type Step = "summary" | "orders" | "contractor" | "decision";

export function PostCompletionDialog({
  open,
  completedJobName,
  signOffNotes,
  daysDeviation,
  nextJob,
  plotId,
  onClose,
  onDecisionMade,
}: PostCompletionDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pushWeeks, setPushWeeks] = useState(1);
  const [showPush, setShowPush] = useState(false);
  const [step, setStep] = useState<Step>("summary");

  // Order resolution state
  const [resolvedOrders, setResolvedOrders] = useState<Set<string>>(new Set());
  // Contractor confirmation state
  const [contractorConfirmed, setContractorConfirmed] = useState(false);
  const [contractorEmailed, setContractorEmailed] = useState(false);

  if (!open) return null;

  const ahead = daysDeviation > 0;
  const behind = daysDeviation < 0;
  const absDays = Math.abs(daysDeviation);

  // Determine which orders need attention
  const orders = nextJob?.orders ?? [];
  const undeliveredOrders = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const hasOrderIssues = undeliveredOrders.length > 0;
  const hasContractor = !!nextJob?.contractorName;
  const allOrdersResolved = undeliveredOrders.every((o) => resolvedOrders.has(o.id));

  async function decide(
    decision: "start_today" | "start_next_monday" | "push_weeks" | "leave_for_now",
    weeks?: number,
    extra?: Record<string, unknown>
  ) {
    setLoading(decision);
    try {
      const res = await fetch(`/api/plots/${plotId}/restart-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, nextJobId: nextJob?.id, pushWeeks: weeks, ...extra }),
      });
      if (res.ok) {
        onDecisionMade();
        onClose();
      }
    } finally {
      setLoading(null);
    }
  }

  function handleStartToday() {
    // Check if we need to resolve orders first
    if (hasOrderIssues && !allOrdersResolved) {
      setStep("orders");
      return;
    }
    // Check if contractor needs confirming
    if (hasContractor && !contractorConfirmed && ahead) {
      setStep("contractor");
      return;
    }
    decide("start_today");
  }

  function handleOrdersResolved() {
    if (hasContractor && !contractorConfirmed && ahead) {
      setStep("contractor");
    } else {
      setStep("decision");
    }
  }

  function markOrderDelivered(orderId: string) {
    // Auto-mark as delivered via API
    fetch(`/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    setResolvedOrders((prev) => new Set(prev).add(orderId));
  }

  function emailSupplier(order: NextJobOrder) {
    const subject = `Urgent — Early delivery required — ${nextJob?.name}`;
    const body = `Hi ${order.supplierContactName || order.supplierName},\n\nWe need to bring forward the delivery for ${nextJob?.name}.\n\nCurrent expected delivery: ${order.expectedDeliveryDate ? format(new Date(order.expectedDeliveryDate), "dd MMM yyyy") : "TBC"}\n\nPlease confirm earliest availability.\n\nRegards`;
    window.open(`mailto:${encodeURIComponent(order.supplierEmail || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    setResolvedOrders((prev) => new Set(prev).add(order.id));
  }

  function emailContractor() {
    const subject = `Early start — ${nextJob?.name}`;
    const body = `Hi,\n\nThe previous job has been completed ${ahead ? `${absDays} day${absDays !== 1 ? "s" : ""} early` : ""}.\n\nWe'd like to start ${nextJob?.name} as soon as possible${nextJob?.startDate ? ` (originally planned ${format(new Date(nextJob.startDate), "dd MMM yyyy")})` : ""}.\n\nPlease confirm your availability.\n\nRegards`;
    const email = nextJob?.contractorEmail || "";
    window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    setContractorEmailed(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header — always shown */}
        <div className="border-b border-border/40 px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Job Signed Off
            </p>
          </div>
          <p className="font-semibold text-foreground">{completedJobName}</p>
          {signOffNotes && (
            <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-muted-foreground italic">&ldquo;{signOffNotes}&rdquo;</p>
          )}

          {daysDeviation !== 0 && (
            <div className={cn("mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", ahead ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
              {ahead ? <TrendingUp className="size-4 shrink-0" /> : <TrendingDown className="size-4 shrink-0" />}
              {absDays} day{absDays !== 1 ? "s" : ""} {ahead ? "ahead of" : "behind"} original programme
            </div>
          )}
          {daysDeviation === 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              <Minus className="size-4 shrink-0" /> On original programme
            </div>
          )}
        </div>

        <div className="px-6 py-4">
          {/* ===== STEP: SUMMARY (default) ===== */}
          {step === "summary" && (
            <>
              {nextJob ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next Job</p>
                  <div className="rounded-xl border border-border/60 bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-foreground">{nextJob.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {nextJob.contractorName && (
                        <span className="flex items-center gap-1"><HardHat className="size-3" />{nextJob.contractorName}</span>
                      )}
                      {nextJob.assignedToName && (
                        <span className="flex items-center gap-1"><User className="size-3" />{nextJob.assignedToName}</span>
                      )}
                      {!nextJob.contractorName && !nextJob.assignedToName && (
                        <span className="text-amber-600">No contractor assigned</span>
                      )}
                    </div>
                    {/* Order/delivery warnings */}
                    {hasOrderIssues && (
                      <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                        <AlertTriangle className="size-3 shrink-0" />
                        {undeliveredOrders.length} undelivered order{undeliveredOrders.length !== 1 ? "s" : ""} — must resolve before starting
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <button onClick={handleStartToday} disabled={!!loading}
                      className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 transition-all">
                      {loading === "start_today" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <PlayCircle className="size-4 shrink-0" />}
                      <span>Start today{ahead && absDays > 0 && <span className="ml-1 font-normal opacity-80">&amp; pull programme forward {absDays}d</span>}</span>
                    </button>

                    <button onClick={() => decide("start_next_monday")} disabled={!!loading}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all">
                      {loading === "start_next_monday" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <CalendarDays className="size-4 shrink-0 text-blue-500" />}
                      Start next Monday &amp; update programme
                    </button>

                    {!showPush ? (
                      <button onClick={() => setShowPush(true)} disabled={!!loading}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all">
                        <Clock className="size-4 shrink-0 text-amber-500" /> Push forward by X weeks...
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-3">
                          <Clock className="size-4 shrink-0 text-amber-500" />
                          <span className="text-sm font-medium">Push</span>
                          <input type="number" min={1} max={52} value={pushWeeks} onChange={(e) => setPushWeeks(Number(e.target.value))}
                            className="w-14 rounded border bg-background px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <span className="text-sm text-muted-foreground">week{pushWeeks !== 1 ? "s" : ""}</span>
                        </div>
                        <button onClick={() => decide("push_weeks", pushWeeks)} disabled={!!loading}
                          className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-all">
                          {loading === "push_weeks" ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                        </button>
                      </div>
                    )}

                    <button onClick={() => decide("leave_for_now")} disabled={!!loading}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all">
                      {loading === "leave_for_now" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <PauseCircle className="size-4 shrink-0" />}
                      Leave for now
                      <span className="ml-auto text-[11px] text-amber-600">Plot goes inactive</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                  <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-700">All jobs complete on this plot!</p>
                </div>
              )}

              {!nextJob && (
                <button onClick={onClose} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700">Done</button>
              )}
            </>
          )}

          {/* ===== STEP: ORDER RESOLUTION ===== */}
          {step === "orders" && (
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                <AlertTriangle className="mr-1 inline size-3" />
                Resolve Orders Before Starting
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                The following orders for <span className="font-medium text-foreground">{nextJob?.name}</span> need attention before the job can start.
              </p>
              <div className="space-y-2">
                {undeliveredOrders.map((order) => {
                  const isResolved = resolvedOrders.has(order.id);
                  const isPending = order.status === "PENDING";
                  const deliveryDate = order.expectedDeliveryDate ? format(new Date(order.expectedDeliveryDate), "dd MMM yyyy") : null;

                  return (
                    <div key={order.id} className={cn("rounded-lg border p-3", isResolved ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{order.supplierName}</p>
                          <p className="text-xs text-muted-foreground">{order.itemsDescription || "Materials"}</p>
                          {isPending && <p className="mt-0.5 text-xs font-medium text-red-600">Order not placed yet</p>}
                          {!isPending && deliveryDate && <p className="mt-0.5 text-xs text-muted-foreground">Delivery due {deliveryDate}</p>}
                        </div>
                        {isResolved ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Resolved</span>
                        ) : (
                          <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold", isPending ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                            {isPending ? "Not Ordered" : order.status}
                          </span>
                        )}
                      </div>
                      {!isResolved && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button onClick={() => markOrderDelivered(order.id)}
                            className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700">
                            <Truck className="size-3" /> Confirmed on site
                          </button>
                          {order.supplierEmail && (
                            <button onClick={() => emailSupplier(order)}
                              className="flex items-center gap-1 rounded border bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-slate-50">
                              <Mail className="size-3" /> Email supplier
                            </button>
                          )}
                          {isPending && (
                            <button onClick={() => { markOrderDelivered(order.id); }}
                              className="flex items-center gap-1 rounded border bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50">
                              <Package className="size-3" /> Place order now
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setStep("summary")} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-muted-foreground hover:bg-slate-50">Back</button>
                <button onClick={handleOrdersResolved} disabled={!allOrdersResolved}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP: CONTRACTOR AVAILABILITY ===== */}
          {step === "contractor" && (
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                <HardHat className="mr-1 inline size-3" />
                Contractor Availability
              </p>
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <p className="font-semibold">{nextJob?.contractorName}</p>
                {nextJob?.contractorPhone && <p className="text-xs text-muted-foreground">{nextJob.contractorPhone}</p>}
                {nextJob?.startDate && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Originally planned: {format(new Date(nextJob.startDate), "dd MMM yyyy")}
                    {ahead && ` (${absDays} days earlier than planned)`}
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {nextJob?.contractorEmail && !contractorEmailed && (
                  <button onClick={emailContractor}
                    className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-medium text-blue-700 hover:bg-blue-100 transition-all">
                    <Mail className="size-4 shrink-0" />
                    Email contractor to request early start
                  </button>
                )}
                {contractorEmailed && !contractorConfirmed && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700">
                    Email opened — confirm contractor response below
                  </div>
                )}

                <button onClick={() => { setContractorConfirmed(true); setStep("decision"); }}
                  className="flex w-full items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-emerald-700 transition-all">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Contractor confirmed — pull programme forward
                </button>

                <button onClick={() => { setContractorConfirmed(true); decide("start_today"); }}
                  className="flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent transition-all">
                  <PlayCircle className="size-4 shrink-0 text-blue-500" />
                  Contractor confirmed — keep programme as is
                  <span className="ml-auto text-[10px] text-muted-foreground">extend their time</span>
                </button>

                <button onClick={() => { decide("leave_for_now", undefined, { awaitingContractor: true }); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-700 hover:bg-amber-100 transition-all"
                  disabled={!!loading}>
                  <Clock className="size-4 shrink-0" />
                  Confirm later — add to Daily Brief
                  <span className="ml-auto text-[10px] text-red-500 font-semibold">Plot goes inactive</span>
                </button>

                <button onClick={() => { setStep("summary"); }}
                  className="w-full rounded-xl border py-2.5 text-sm font-medium text-muted-foreground hover:bg-slate-50">
                  Back
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP: DECISION (after order + contractor resolution) ===== */}
          {step === "decision" && (
            <div>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                <CheckCircle2 className="size-3" /> All checks passed — ready to start
              </div>
              <div className="space-y-2">
                <button onClick={() => decide("start_today")} disabled={!!loading}
                  className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-all">
                  {loading === "start_today" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <PlayCircle className="size-4 shrink-0" />}
                  Start today &amp; pull programme forward
                </button>
                <button onClick={() => setStep("summary")} className="w-full rounded-xl border py-2.5 text-sm font-medium text-muted-foreground hover:bg-slate-50">
                  Back to options
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
