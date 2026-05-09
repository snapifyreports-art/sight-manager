"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, Save, RotateCcw, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  SupplierData,
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
} from "./types";

/**
 * Spreadsheet-style "all orders" table — quick-fix UI surfaced from
 * the validation panel ("N orders have no supplier" → "Edit orders").
 *
 * Columns:
 *   Items · For · Supplier · Anchor · Amount · Unit · Dir · Lead · Lead unit
 *
 * Editing model (May 2026 rework — Keith caught the save-on-blur
 * pattern firing one save per cell):
 *   - All inputs are CONTROLLED with a local draft state per order.
 *   - The dialog tracks dirty rows + a single "Save changes" button.
 *   - Save button fires a parallel batch of PUTs only for dirty rows.
 *   - Discard button reverts everything to the original.
 *   - Closing the dialog with unsaved changes shows a confirm prompt.
 *
 * Items are still edited in the per-order dialog (multi-line UX
 * doesn't fit a row); this surface is for picking suppliers,
 * adjusting anchors, and tweaking lead times across many orders at
 * once.
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
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierData[]>([]);

  const rows = useMemo(() => collectOrders(template), [template]);

  // Local draft state — keyed by order id.
  type Draft = {
    supplierId: string | null;
    anchorType: string | null;
    anchorAmount: number | null;
    anchorUnit: string | null;
    anchorDirection: string | null;
    leadTimeAmount: number | null;
    leadTimeUnit: string | null;
  };
  const initialDrafts = useMemo<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const r of rows) {
      out[r.order.id] = {
        supplierId: r.order.supplierId ?? null,
        anchorType: r.order.anchorType ?? "JOB_START",
        anchorAmount: r.order.anchorAmount ?? 0,
        anchorUnit: (r.order.anchorUnit ?? "WEEKS").toString().toUpperCase(),
        anchorDirection: (r.order.anchorDirection ?? "BEFORE")
          .toString()
          .toUpperCase(),
        leadTimeAmount: r.order.leadTimeAmount ?? 0,
        leadTimeUnit: (r.order.leadTimeUnit ?? "WEEKS").toString().toUpperCase(),
      };
    }
    return out;
  }, [rows]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initialDrafts);

  // Reset drafts when the dialog (re)opens with fresh template data
  useEffect(() => {
    if (open) setDrafts(initialDrafts);
  }, [open, initialDrafts]);

  // Lazy-fetch suppliers when the dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/suppliers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: SupplierData[]) =>
        setSuppliers(Array.isArray(d) ? d : []),
      )
      .catch(() => setSuppliers([]));
  }, [open]);

  function update(orderId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], ...patch },
    }));
  }

  function isDirty(orderId: string): boolean {
    const original = initialDrafts[orderId];
    const current = drafts[orderId];
    if (!original || !current) return false;
    return (
      original.supplierId !== current.supplierId ||
      original.anchorType !== current.anchorType ||
      original.anchorAmount !== current.anchorAmount ||
      original.anchorUnit !== current.anchorUnit ||
      original.anchorDirection !== current.anchorDirection ||
      original.leadTimeAmount !== current.leadTimeAmount ||
      original.leadTimeUnit !== current.leadTimeUnit
    );
  }

  const dirtyIds = useMemo(
    () => rows.map((r) => r.order.id).filter((id) => isDirty(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, rows, initialDrafts],
  );

  async function saveAll() {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    let failures = 0;
    try {
      // Sequential rather than parallel — each PUT triggers a derive
      // step on the server (deriveOrderOffsets) that touches the
      // pooled connection. Sequential keeps it gentle and the typical
      // dirty count is small (1-8).
      for (const orderId of dirtyIds) {
        const row = rows.find((r) => r.order.id === orderId);
        if (!row) continue;
        const draft = drafts[orderId];
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${row.order.templateJobId}/orders/${orderId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          },
        );
        if (!res.ok) {
          failures += 1;
          toast.error(
            await fetchErrorMessage(
              res,
              `Failed to update order on ${row.jobName}`,
            ),
          );
        }
      }
      if (failures === 0) {
        toast.success(
          `Saved ${dirtyIds.length} order${dirtyIds.length === 1 ? "" : "s"}`,
        );
      }
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  function discardAll() {
    setDrafts(initialDrafts);
  }

  function attemptClose() {
    if (dirtyIds.length === 0) {
      onClose();
      return;
    }
    const proceed = window.confirm(
      `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"} — discard and close?`,
    );
    if (proceed) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && attemptClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            <Truck className="-mt-0.5 mr-2 inline size-4 text-blue-600" />
            All orders ({rows.length})
          </DialogTitle>
          <DialogDescription>
            Quick-edit supplier, anchor, and lead-time across every order.
            Items stay in the per-order dialog. Changes batch — hit Save
            when done.
          </DialogDescription>
        </DialogHeader>

        {/* Quick-assign supplier bar — pick once, applies to every row
            that doesn't already have a supplier. Overwrite-all toggle
            for the case where you've changed suppliers across the
            board. Same pattern the Contractors dialog uses per stage. */}
        {rows.length > 0 && (
          <QuickAssignSupplierBar
            suppliers={suppliers}
            onApply={(supplierId, overwriteAll) => {
              setDrafts((prev) => {
                const next = { ...prev };
                for (const r of rows) {
                  if (overwriteAll || !next[r.order.id].supplierId) {
                    next[r.order.id] = {
                      ...next[r.order.id],
                      supplierId,
                    };
                  }
                }
                return next;
              });
            }}
          />
        )}

        <div className="max-h-[60vh] overflow-auto rounded border">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No orders yet — add one from a sub-job to see it here.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-30 border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left"></th>
                  <th className="px-2 py-1.5 text-left">Items</th>
                  <th className="px-2 py-1.5 text-left">For</th>
                  <th className="px-2 py-1.5 text-left">Supplier</th>
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
                  const d = drafts[r.order.id];
                  if (!d) return null;
                  const dirty = isDirty(r.order.id);
                  return (
                    <tr
                      key={r.order.id}
                      className={dirty ? "bg-blue-50/40" : "hover:bg-slate-50/50"}
                    >
                      <td className="px-2 py-1 text-center">
                        {dirty && (
                          <span
                            className="inline-block size-2 rounded-full bg-blue-500"
                            title="Unsaved changes"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 font-medium">
                        {r.order.itemsDescription ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {r.jobName}
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={d.supplierId ?? "__none__"}
                          onValueChange={(v) =>
                            update(r.order.id, {
                              supplierId: v === "__none__" ? null : (v ?? null),
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-40 text-xs">
                            <SelectValue>
                              {d.supplierId
                                ? suppliers.find((s) => s.id === d.supplierId)
                                    ?.name ?? "Unknown"
                                : <span className="text-muted-foreground">
                                    None
                                  </span>}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None
                              </span>
                            </SelectItem>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={d.anchorType ?? "JOB_START"}
                          onValueChange={(v) =>
                            update(r.order.id, { anchorType: v ?? null })
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
                          value={d.anchorAmount ?? 0}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            update(r.order.id, {
                              anchorAmount: Number.isFinite(v) ? v : 0,
                            });
                          }}
                          className="h-7 w-16 text-center text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={d.anchorUnit ?? "WEEKS"}
                          onValueChange={(v) =>
                            update(r.order.id, { anchorUnit: v ?? null })
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
                          value={d.anchorDirection ?? "BEFORE"}
                          onValueChange={(v) =>
                            update(r.order.id, { anchorDirection: v ?? null })
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
                          value={d.leadTimeAmount ?? 0}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            update(r.order.id, {
                              leadTimeAmount: Number.isFinite(v) ? v : 0,
                            });
                          }}
                          className="h-7 w-16 text-center text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={d.leadTimeUnit ?? "WEEKS"}
                          onValueChange={(v) =>
                            update(r.order.id, { leadTimeUnit: v ?? null })
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {dirtyIds.length === 0 ? (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                All saved
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-blue-700">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                {dirtyIds.length} unsaved change
                {dirtyIds.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={discardAll}
              disabled={saving || dirtyIds.length === 0}
              className="text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              Discard
            </Button>
            <Button variant="outline" onClick={attemptClose} disabled={saving}>
              Close
            </Button>
            <Button onClick={saveAll} disabled={saving || dirtyIds.length === 0}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick-assign supplier bar shown above the orders table. Picks one
 * supplier and applies it to every row in the dialog with one click.
 * Overwrite checkbox controls whether already-set suppliers get
 * replaced (default: only fill the empty ones — safer).
 */
function QuickAssignSupplierBar({
  suppliers,
  onApply,
}: {
  suppliers: SupplierData[];
  onApply: (supplierId: string | null, overwriteAll: boolean) => void;
}) {
  const [picked, setPicked] = useState<string>("__pick__");
  const [overwrite, setOverwrite] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-blue-50/40 px-3 py-2 text-xs">
      <span className="font-medium text-blue-900">Quick assign supplier:</span>
      <Select
        value={picked}
        onValueChange={(v) => setPicked(v ?? "__pick__")}
      >
        <SelectTrigger className="h-7 w-56 text-xs">
          <SelectValue placeholder="Pick a supplier…">
            {picked === "__pick__"
              ? <span className="text-muted-foreground">Pick a supplier…</span>
              : picked === "__none__"
                ? "None (clear)"
                : suppliers.find((s) => s.id === picked)?.name ?? picked}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None (clear)</SelectItem>
          {suppliers.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
          className="size-3"
        />
        Overwrite already-set
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={picked === "__pick__"}
        onClick={() => {
          const id = picked === "__none__" ? null : picked;
          onApply(id, overwrite);
          setPicked("__pick__");
        }}
        className="h-7 text-xs"
      >
        Apply{overwrite ? " to all" : " to empty rows"}
      </Button>
      <span className="ml-auto text-[10px] text-muted-foreground">
        Doesn&apos;t save automatically — review then hit Save.
      </span>
    </div>
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
