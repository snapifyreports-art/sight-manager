"use client";

import { useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import type {
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
} from "./types";

/**
 * Spreadsheet-style "all orders" table.
 *
 * Editing N orders one-dialog-at-a-time is slow. This shows every order
 * as a row with anchor / lead-time / supplier / items columns inline.
 * Save-on-blur per cell, mirroring the existing inline-edit pattern on
 * sub-job durations.
 *
 * Read-mostly for now — it edits the four "core" timing fields
 * (anchorAmount, anchorUnit, anchorDirection, leadTimeAmount,
 * leadTimeUnit). Items and suppliers stay in the per-order dialog
 * because their UX is multi-line and doesn't fit a row.
 */
export function TemplateOrdersTableDialog({
  open,
  onClose,
  template,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  template: TemplateData;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const rows = useMemo(() => collectOrders(template), [template]);

  async function patchOrder(
    orderId: string,
    jobId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setSavingId(orderId);
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/jobs/${jobId}/orders/${orderId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update order"));
        return;
      }
      await onChanged();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            <Truck className="-mt-0.5 mr-2 inline size-4 text-blue-600" />
            All orders ({rows.length})
          </DialogTitle>
          <DialogDescription>
            Quick-edit anchor + lead-time across every order in this template.
            Items and suppliers stay in the per-order dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded border">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No orders yet — add one from a sub-job to see it here.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Items</th>
                  <th className="px-2 py-1.5 text-left">For</th>
                  <th className="px-2 py-1.5 text-left">Anchor</th>
                  <th className="px-2 py-1.5 text-left">Amount</th>
                  <th className="px-2 py-1.5 text-left">Unit</th>
                  <th className="px-2 py-1.5 text-left">Dir</th>
                  <th className="px-2 py-1.5 text-left">Lead</th>
                  <th className="px-2 py-1.5 text-left">Lead unit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const isSaving = savingId === r.order.id;
                  return (
                    <tr key={r.order.id} className="hover:bg-slate-50/50">
                      <td className="px-2 py-1 font-medium">
                        {r.order.itemsDescription ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {r.jobName}
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={r.order.anchorType ?? "JOB_START"}
                          onValueChange={(v) =>
                            patchOrder(r.order.id, r.order.templateJobId, { anchorType: v })
                          }
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="JOB_START">Job start</SelectItem>
                            <SelectItem value="JOB_END">Job end</SelectItem>
                            <SelectItem value="STAGE_START">
                              Stage start
                            </SelectItem>
                            <SelectItem value="STAGE_END">Stage end</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={r.order.anchorAmount ?? 0}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v)) return;
                            if (v === r.order.anchorAmount) return;
                            patchOrder(r.order.id, r.order.templateJobId, { anchorAmount: v });
                          }}
                          className="h-7 w-16 text-center text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={(r.order.anchorUnit ?? "WEEKS").toString()}
                          onValueChange={(v) =>
                            patchOrder(r.order.id, r.order.templateJobId, { anchorUnit: v })
                          }
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WEEKS">wk</SelectItem>
                            <SelectItem value="DAYS">d</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={(
                            r.order.anchorDirection ?? "BEFORE"
                          ).toString()}
                          onValueChange={(v) =>
                            patchOrder(r.order.id, r.order.templateJobId, { anchorDirection: v })
                          }
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BEFORE">before</SelectItem>
                            <SelectItem value="AFTER">after</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={r.order.leadTimeAmount ?? 0}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v)) return;
                            if (v === r.order.leadTimeAmount) return;
                            patchOrder(r.order.id, r.order.templateJobId, { leadTimeAmount: v });
                          }}
                          className="h-7 w-16 text-center text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <span className="flex items-center gap-1">
                          <Select
                            value={(r.order.leadTimeUnit ?? "WEEKS").toString()}
                            onValueChange={(v) =>
                              patchOrder(r.order.id, r.order.templateJobId, { leadTimeUnit: v })
                            }
                          >
                            <SelectTrigger className="h-7 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WEEKS">wk</SelectItem>
                              <SelectItem value="DAYS">d</SelectItem>
                            </SelectContent>
                          </Select>
                          {isSaving && (
                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrderRow {
  order: TemplateOrderData;
  jobName: string;
}

function collectOrders(template: TemplateData): OrderRow[] {
  const result: OrderRow[] = [];
  function visit(job: TemplateJobData) {
    for (const o of job.orders ?? []) result.push({ order: o, jobName: job.name });
    for (const c of job.children ?? []) visit(c);
  }
  for (const stage of template.jobs) visit(stage);
  return result;
}
