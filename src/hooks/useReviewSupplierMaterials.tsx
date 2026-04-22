"use client";

/**
 * Shared "Review items → update supplier pricelist" flow.
 *
 * Called after an order (template order or one-off) is saved. Diffs the
 * order's items against the supplier's pricelist and opens a dialog
 * letting the user:
 *   - NEW items       → tick to add to pricelist (default: ticked)
 *   - EXACT matches   → info only, no action
 *   - PRICE CONFLICTS → pick: update list / add as separate item / skip
 *
 * When "Add as separate item" is chosen, the user types a new name
 * (required + must not collide with existing supplier materials). We
 * don't auto-name variants — Keith Apr 2026: "ask user".
 *
 * The hook fetches the pricelist, runs the diff, renders the dialog,
 * and applies changes via the existing per-item endpoints:
 *   POST /api/suppliers/[id]/pricelist           (creates)
 *   PUT  /api/suppliers/[id]/pricelist/[itemId]  (updates)
 *
 * Usage:
 *   const { openReview, dialogs } = useReviewSupplierMaterials();
 *   // render {dialogs} once
 *   // after order save:
 *   openReview({ supplierId, supplierName, items });
 */

import { useCallback, useState, type ReactNode } from "react";
import { Loader2, Check, Plus, AlertTriangle } from "lucide-react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
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

export interface ReviewableItem {
  name: string;
  unit: string;
  unitCost: number;
  category?: string | null;
}

interface PricelistRow {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}

type ItemState =
  | { kind: "new"; item: ReviewableItem; add: boolean }
  | { kind: "exact-match"; item: ReviewableItem; pricelistRow: PricelistRow }
  | {
      kind: "conflict";
      item: ReviewableItem;
      pricelistRow: PricelistRow;
      action: "update" | "variant" | "skip";
      variantName: string;
    };

interface OpenReviewArgs {
  supplierId: string;
  supplierName?: string;
  items: ReviewableItem[];
  onComplete?: () => void;
}

interface UseReviewSupplierMaterialsResult {
  /** Open the review dialog (fetches pricelist + diffs + opens). */
  openReview: (args: OpenReviewArgs) => Promise<void>;
  /** Render once in the component tree. */
  dialogs: ReactNode;
}

export function useReviewSupplierMaterials(): UseReviewSupplierMaterialsResult {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [states, setStates] = useState<ItemState[]>([]);
  const [pricelist, setPricelist] = useState<PricelistRow[]>([]);
  const [onCompleteRef, setOnCompleteRef] = useState<(() => void) | null>(null);

  const openReview = useCallback(async (args: OpenReviewArgs) => {
    if (!args.supplierId || args.items.length === 0) return;
    setSupplierId(args.supplierId);
    setSupplierName(args.supplierName ?? "this supplier");
    setOnCompleteRef(() => args.onComplete ?? null);
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/suppliers/${args.supplierId}/pricelist`);
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Could not load supplier pricelist"));
        setOpen(false);
        return;
      }
      const rows = (await res.json()) as PricelistRow[];
      setPricelist(rows);

      // Diff items against pricelist. Name match is case-insensitive
      // + trimmed so "Decorator Caulk" and "decorator caulk  " match.
      const byName = new Map<string, PricelistRow>();
      for (const r of rows) byName.set(r.name.trim().toLowerCase(), r);

      const computed: ItemState[] = args.items
        .filter((it) => it.name.trim())
        .map((item) => {
          const existing = byName.get(item.name.trim().toLowerCase());
          if (!existing) return { kind: "new", item, add: true };
          // Tolerate floating-point pence — compare to 2dp.
          const matches = Math.abs(existing.unitCost - item.unitCost) < 0.005;
          if (matches) return { kind: "exact-match", item, pricelistRow: existing };
          return {
            kind: "conflict",
            item,
            pricelistRow: existing,
            action: "skip",
            variantName: "",
          };
        });

      // If every item is an exact-match, nothing to review — close.
      const hasAnything = computed.some((s) => s.kind !== "exact-match");
      if (!hasAnything) {
        setOpen(false);
        args.onComplete?.();
        return;
      }

      setStates(computed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open review");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updateState = useCallback((idx: number, patch: Partial<ItemState>) => {
    setStates((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      // Type gymnastics: spread only within the same variant, React
      // will choke on invalid combinations but TS erases at runtime.
      return { ...s, ...patch } as ItemState;
    }));
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStates([]);
    onCompleteRef?.();
  }, [onCompleteRef]);

  const apply = useCallback(async () => {
    // Validate variant names before firing any network calls.
    const existingNamesLower = new Set(
      pricelist.map((r) => r.name.trim().toLowerCase())
    );
    for (const s of states) {
      if (s.kind === "conflict" && s.action === "variant") {
        const n = s.variantName.trim();
        if (!n) {
          toast.error(`Enter a name for the "${s.item.name}" variant`);
          return;
        }
        if (existingNamesLower.has(n.toLowerCase())) {
          toast.error(`"${n}" already exists for ${supplierName}`);
          return;
        }
      }
    }

    setApplying(true);
    try {
      // Collect per-item actions.
      const creates: ReviewableItem[] = [];
      const updates: Array<{ id: string; unitCost: number }> = [];
      const variants: ReviewableItem[] = [];

      for (const s of states) {
        if (s.kind === "new" && s.add) creates.push(s.item);
        else if (s.kind === "conflict") {
          if (s.action === "update") {
            updates.push({ id: s.pricelistRow.id, unitCost: s.item.unitCost });
          } else if (s.action === "variant") {
            variants.push({
              name: s.variantName.trim(),
              unit: s.item.unit,
              unitCost: s.item.unitCost,
              category: s.item.category,
            });
          }
        }
      }

      const allCreates = [...creates, ...variants];
      const results = await Promise.allSettled([
        ...allCreates.map((c) =>
          fetch(`/api/suppliers/${supplierId}/pricelist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: c.name.trim(),
              unit: c.unit,
              unitCost: c.unitCost,
              category: c.category ?? null,
            }),
          })
        ),
        ...updates.map((u) =>
          fetch(`/api/suppliers/${supplierId}/pricelist/${u.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitCost: u.unitCost }),
          })
        ),
      ]);

      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
      if (failed.length > 0) {
        toast.error(`${failed.length} item${failed.length !== 1 ? "s" : ""} failed to save`);
      } else {
        const createdCount = allCreates.length;
        const updatedCount = updates.length;
        const msg: string[] = [];
        if (createdCount > 0) msg.push(`${createdCount} added`);
        if (updatedCount > 0) msg.push(`${updatedCount} updated`);
        if (msg.length > 0) {
          toast.success(`Pricelist: ${msg.join(", ")}`);
        }
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update pricelist");
    } finally {
      setApplying(false);
    }
  }, [pricelist, states, supplierId, supplierName, toast, close]);

  const dialogs = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !applying) close();
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Update {supplierName} price list?</DialogTitle>
          <DialogDescription>
            Review the items in this order and decide which ones to save back to {supplierName}&apos;s price list for next time.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking price list…
          </div>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto py-1">
            {states.map((s, idx) => {
              if (s.kind === "exact-match") {
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs"
                  >
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-slate-700">{s.item.name}</span>
                      <span className="text-muted-foreground"> · £{s.item.unitCost.toFixed(2)}/{s.item.unit}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-emerald-700">already in list</span>
                  </div>
                );
              }
              if (s.kind === "new") {
                return (
                  <label
                    key={idx}
                    className="flex cursor-pointer items-start gap-2 rounded border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs hover:bg-blue-50"
                  >
                    <input
                      type="checkbox"
                      checked={s.add}
                      onChange={(e) => updateState(idx, { add: e.target.checked })}
                      className="mt-0.5 shrink-0"
                    />
                    <Plus className="size-3.5 shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{s.item.name}</span>
                      <span className="text-muted-foreground">
                        £{s.item.unitCost.toFixed(2)}/{s.item.unit} · add to price list
                      </span>
                    </span>
                  </label>
                );
              }
              // conflict
              return (
                <div
                  key={idx}
                  className="space-y-1.5 rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{s.item.name}</span>
                      <span className="text-muted-foreground">
                        List has £{s.pricelistRow.unitCost.toFixed(2)} · this order £{s.item.unitCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 pl-5">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={s.action === "update"}
                        onChange={() => updateState(idx, { action: "update" })}
                      />
                      <span>Update list to £{s.item.unitCost.toFixed(2)}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={s.action === "variant"}
                        onChange={() => updateState(idx, { action: "variant" })}
                      />
                      <span>Add as a separate item</span>
                    </label>
                    {s.action === "variant" && (
                      <Input
                        autoFocus
                        value={s.variantName}
                        onChange={(e) => updateState(idx, { variantName: e.target.value })}
                        placeholder={`e.g. ${s.item.name} (trade price)`}
                        className="ml-5 h-7 text-xs"
                      />
                    )}
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={s.action === "skip"}
                        onChange={() => updateState(idx, { action: "skip" })}
                      />
                      <span>Leave list alone</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={applying}>
            Skip all
          </Button>
          <Button onClick={apply} disabled={applying || loading}>
            {applying ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Applying…
              </>
            ) : (
              "Apply changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openReview, dialogs };
}
