"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Plus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

interface PlotMaterial {
  id: string;
  sourceType: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  category: string | null;
  delivered: number;
  consumed: number;
  notes: string | null;
}

export function PlotMaterialsSection({ plotId }: { plotId: string }) {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [materials, setMaterials] = useState<PlotMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("each");
  const [unitCost, setUnitCost] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/plots/${plotId}/materials`);
    if (res.ok) setMaterials(await res.json());
    setLoading(false);
  }, [plotId]);

  useEffect(() => { load(); }, [load]);

  async function updateField(m: PlotMaterial, patch: Partial<Pick<PlotMaterial, "delivered" | "consumed" | "quantity">>) {
    try {
      const res = await fetch(`/api/plots/${plotId}/materials/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update material"));
        return;
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error updating material");
    }
  }

  async function deleteMaterial(m: PlotMaterial) {
    const ok = await confirm({
      title: `Delete "${m.name}"?`,
      body: "This material will be removed from the plot. This cannot be undone.",
      confirmLabel: "Delete material",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/plots/${plotId}/materials/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, `Failed to delete "${m.name}"`));
        return;
      }
      toast.success(`"${m.name}" deleted`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error deleting material");
    }
  }

  async function submit() {
    if (!name || !quantity) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, quantity: Number(quantity), unit,
          unitCost: unitCost ? Number(unitCost) : null,
          category: category || null,
        }),
      });
      if (res.ok) {
        setAddOpen(false);
        setName(""); setQuantity(""); setUnitCost(""); setCategory("");
        toast.success(`"${name}" added`);
        load();
      } else {
        toast.error(await fetchErrorMessage(res, "Failed to add material"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error adding material");
    } finally { setSubmitting(false); }
  }

  const totals = useMemo(() => {
    let expected = 0, delivered = 0, consumed = 0, cost = 0;
    for (const m of materials) {
      expected += m.quantity;
      delivered += m.delivered;
      consumed += m.consumed;
      cost += (m.unitCost ?? 0) * m.quantity;
    }
    return { expected, delivered, consumed, cost };
  }, [materials]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin mr-2" />Loading materials…</div>;

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Package className="size-4 text-blue-600" /> Materials ({materials.length})</h2>
          <p className="text-[11px] text-muted-foreground">Expected {totals.expected.toLocaleString()} · Delivered {totals.delivered.toLocaleString()} · Consumed {totals.consumed.toLocaleString()} · Cost £{totals.cost.toFixed(2)}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add manual</Button>
      </div>

      {materials.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No materials tracked on this plot. Add ones that aren&apos;t coming through orders (e.g. bricks, mortar, blocks).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Material</th>
                <th className="px-3 py-2 text-left">Cat</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Delivered</th>
                <th className="px-3 py-2 text-right">Consumed</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.map((m) => (
                <tr key={m.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.category ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.quantity.toLocaleString()} {m.unit}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" defaultValue={m.delivered}
                      className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== m.delivered) updateField(m, { delivered: v }); }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" defaultValue={m.consumed}
                      className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== m.consumed) updateField(m, { consumed: v }); }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{(m.delivered - m.consumed).toLocaleString()}</td>
                  <td className="px-3 py-2 text-[11px] uppercase text-muted-foreground">{m.sourceType}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => deleteMaterial(m)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add manual material</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Quantity</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div><Label>£/unit (optional)</Label><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></div>
            <div><Label>Category (optional)</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !name || !quantity}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
