"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Truck, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toDateKey } from "@/lib/dates";
import { getCurrentDateAtMidnight } from "@/lib/dev-date";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * (#167) Delivery follow-up dialog used after a "Start anyway — mark
 * order(s) sent" override in the Pull Forward flow. For each order that
 * just flipped to ORDERED, the manager picks one of:
 *
 *   • Mark delivered today  → status=DELIVERED, deliveredDate=today
 *   • Set new delivery date → status=ORDERED, expectedDeliveryDate=picked
 *
 * Submits per-order PUT calls to /api/orders/[id], then fires onDone.
 * Used by both the "Starting Early" dialog (useJobAction) and the
 * standalone Pull Job Forward dialog (usePullForwardDecision) so the
 * UX is identical wherever a pull-forward is initiated.
 */

export interface PendingDeliveryFollowUp {
  id: string;
  /** Optional — show supplier name in the row label if we know it. */
  supplierName?: string | null;
}

interface Props {
  orders: PendingDeliveryFollowUp[] | null;
  onClose: () => void;
  onDone?: () => void;
}

type Mode = "delivered_today" | "new_date";

export function OrderDeliveryFollowUpDialog({ orders, onClose, onDone }: Props) {
  const toast = useToast();
  const open = !!orders && orders.length > 0;

  const todayISO = useMemo(() => toDateKey(getCurrentDateAtMidnight()), []);
  const [picks, setPicks] = useState<Record<string, { mode: Mode; date: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orders) return;
    const seed: Record<string, { mode: Mode; date: string }> = {};
    for (const o of orders) {
      seed[o.id] = { mode: "delivered_today", date: todayISO };
    }
    setPicks(seed);
  }, [orders, todayISO]);

  async function submit() {
    if (!orders) return;
    setSubmitting(true);
    try {
      for (const o of orders) {
        const pick = picks[o.id] ?? { mode: "delivered_today", date: todayISO };
        const body =
          pick.mode === "delivered_today"
            ? { status: "DELIVERED", deliveredDate: todayISO }
            : { status: "ORDERED", expectedDeliveryDate: pick.date };
        const res = await fetch(`/api/orders/${o.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Couldn't update order delivery"));
          return;
        }
      }
      toast.success(
        `${orders.length} order${orders.length !== 1 ? "s" : ""} updated`,
      );
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update order delivery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-emerald-600" aria-hidden />
            Delivery status
          </DialogTitle>
          <DialogDescription>
            {orders && orders.length > 1
              ? `${orders.length} orders were marked as sent. Where do they stand?`
              : "The order was marked as sent. Where does it stand?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {orders?.map((o) => {
            const pick = picks[o.id] ?? { mode: "delivered_today" as Mode, date: todayISO };
            return (
              <div key={o.id} className="rounded-lg border bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium">
                  {o.supplierName || "Order"}
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`mode-${o.id}`}
                      checked={pick.mode === "delivered_today"}
                      onChange={() =>
                        setPicks((s) => ({
                          ...s,
                          [o.id]: { mode: "delivered_today", date: todayISO },
                        }))
                      }
                    />
                    <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                    Delivered today ({format(getCurrentDateAtMidnight(), "d MMM")})
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`mode-${o.id}`}
                      className="mt-1"
                      checked={pick.mode === "new_date"}
                      onChange={() =>
                        setPicks((s) => ({
                          ...s,
                          [o.id]: { mode: "new_date", date: pick.date || todayISO },
                        }))
                      }
                    />
                    <div className="flex-1">
                      <p>Set new delivery date</p>
                      {pick.mode === "new_date" && (
                        <Input
                          type="date"
                          value={pick.date}
                          onChange={(e) =>
                            setPicks((s) => ({
                              ...s,
                              [o.id]: { mode: "new_date", date: e.target.value },
                            }))
                          }
                          className="mt-1 h-8 text-sm"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
