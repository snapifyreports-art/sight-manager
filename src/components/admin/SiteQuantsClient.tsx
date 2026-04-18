"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Boxes, ShoppingCart, Plus, Loader2, Trash2, Send, Truck, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

interface ManualByMaterial {
  name: string;
  unit: string;
  category: string | null;
  expected: number;
  delivered: number;
  consumed: number;
  cost: number;
  plots: number;
}
interface ManualPerPlot {
  id: string;
  plotId: string;
  plotNumber: string | null;
  plotName: string;
  sourceType: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  category: string | null;
  notes: string | null;
  delivered: number;
  consumed: number;
  remaining: number;
}
interface AutomatedOrder {
  id: string;
  supplier: string;
  status: string;
  itemsDescription: string | null;
  dateOfOrder: string;
  jobName: string;
  plot: { id: string; plotNumber: string | null; name: string } | null;
  items: Array<{ name: string; quantity: number; unit: string; unitCost: number; totalCost: number }>;
  total: number;
}
interface OneOffOrder extends Omit<AutomatedOrder, "jobName"> { plot: { id: string; plotNumber: string | null; name: string } | null }

interface QuantsResponse {
  siteId: string;
  generatedAt: string;
  manual: { byMaterial: ManualByMaterial[]; perPlot: ManualPerPlot[] };
  automated: AutomatedOrder[];
  oneOff: OneOffOrder[];
  totals: { manualCostExpected: number; automatedValueAll: number; oneOffValue: number };
}

interface Plot { id: string; plotNumber: string | null; name: string }
interface Supplier { id: string; name: string }

export function SiteQuantsClient({
  siteId,
  plots,
}: {
  siteId: string;
  plots: Plot[];
}) {
  const [tab, setTab] = useState<"manual" | "automated" | "oneoff">("manual");
  const [data, setData] = useState<QuantsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/suppliers");
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load suppliers"));
          return;
        }
        const ss = await res.json();
        setSuppliers(ss.map((s: Supplier) => ({ id: s.id, name: s.name })));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load suppliers");
      }
    })();
  }, [toast]);

  // Add-manual dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [mPlotId, setMPlotId] = useState("");
  const [mName, setMName] = useState("");
  const [mQuantity, setMQuantity] = useState("");
  const [mUnit, setMUnit] = useState("each");
  const [mUnitCost, setMUnitCost] = useState("");
  const [mCategory, setMCategory] = useState("");
  const [mSubmitting, setMSubmitting] = useState(false);

  // Add-one-off dialog
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [oSupplierId, setOSupplierId] = useState("");
  const [oPlotId, setOPlotId] = useState("__site__");
  const [oDesc, setODesc] = useState("");
  const [oItems, setOItems] = useState([{ name: "", quantity: 1, unit: "each", unitCost: 0 }]);
  const [oSubmitting, setOSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/quants`);
      if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Per-plot inline delivered/consumed update
  async function updatePerPlot(m: ManualPerPlot, patch: Partial<Pick<ManualPerPlot, "delivered" | "consumed" | "quantity">>) {
    try {
      await fetch(`/api/plots/${m.plotId}/materials/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      refresh();
    } catch {}
  }

  // One-off order status transitions
  const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(new Set());
  async function updateOneOffStatus(orderId: string, status: "ORDERED" | "DELIVERED" | "CANCELLED") {
    if (status === "CANCELLED" && !confirm("Cancel this one-off order? Line-item costs will no longer count toward totals.")) return;
    setPendingStatusIds((prev) => new Set(prev).add(orderId));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } finally {
      setPendingStatusIds((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  }
  async function deletePerPlot(m: ManualPerPlot) {
    if (!confirm(`Delete "${m.name}" from ${m.plotNumber ? `Plot ${m.plotNumber}` : m.plotName}?`)) return;
    await fetch(`/api/plots/${m.plotId}/materials/${m.id}`, { method: "DELETE" });
    refresh();
  }

  async function submitManual() {
    if (!mPlotId || !mName || !mQuantity) return;
    setMSubmitting(true);
    try {
      const res = await fetch(`/api/plots/${mPlotId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mName,
          quantity: Number(mQuantity),
          unit: mUnit,
          unitCost: mUnitCost ? Number(mUnitCost) : null,
          category: mCategory || null,
        }),
      });
      if (res.ok) {
        setManualOpen(false);
        setMName(""); setMQuantity(""); setMUnitCost(""); setMCategory("");
        refresh();
      }
    } finally { setMSubmitting(false); }
  }

  async function submitOneOff() {
    if (!oSupplierId || oItems.some((i) => !i.name || !i.quantity)) return;
    setOSubmitting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/one-off-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: oSupplierId,
          plotId: oPlotId === "__site__" ? null : oPlotId,
          itemsDescription: oDesc || null,
          items: oItems.filter((i) => i.name && i.quantity > 0),
        }),
      });
      if (res.ok) {
        setOneOffOpen(false);
        setOSupplierId(""); setOPlotId("__site__"); setODesc("");
        setOItems([{ name: "", quantity: 1, unit: "each", unitCost: 0 }]);
        refresh();
      }
    } finally { setOSubmitting(false); }
  }

  const summary = useMemo(() => {
    if (!data) return null;
    const manualTotal = data.totals.manualCostExpected;
    const automatedTotal = data.totals.automatedValueAll;
    const oneOffTotal = data.totals.oneOffValue;
    return { manualTotal, automatedTotal, oneOffTotal, grand: manualTotal + automatedTotal + oneOffTotal };
  }, [data]);

  if (loading && !data) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin mr-2" />Loading quants…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Manual materials</p>
          <p className="text-lg font-semibold">£{summary?.manualTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-muted-foreground">{data.manual.byMaterial.length} material types · {data.manual.perPlot.length} plot rows</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Automated (orders)</p>
          <p className="text-lg font-semibold">£{summary?.automatedTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-muted-foreground">{data.automated.length} orders</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">One-off orders</p>
          <p className="text-lg font-semibold">£{summary?.oneOffTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-muted-foreground">{data.oneOff.length} orders</p>
        </div>
        <div className="rounded-xl border bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">Site material total</p>
          <p className="text-lg font-semibold">£{summary?.grand.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-muted-foreground">All sources combined</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b">
        <button onClick={() => setTab("manual")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Package className="size-4" /> Manual ({data.manual.perPlot.length})
        </button>
        <button onClick={() => setTab("automated")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === "automated" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Boxes className="size-4" /> Automated ({data.automated.length})
        </button>
        <button onClick={() => setTab("oneoff")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === "oneoff" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <ShoppingCart className="size-4" /> One-off ({data.oneOff.length})
        </button>
        <div className="ml-auto">
          {tab === "manual" && (
            <Button size="sm" onClick={() => setManualOpen(true)}><Plus className="size-4" /> Add manual quant</Button>
          )}
          {tab === "oneoff" && (
            <Button size="sm" onClick={() => setOneOffOpen(true)}><Plus className="size-4" /> New one-off order</Button>
          )}
        </div>
      </div>

      {/* Tab content */}
      {tab === "manual" && (
        <div className="space-y-4">
          {/* Roll-up by material */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roll-up by material</div>
            {data.manual.byMaterial.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No manual materials on this site yet. Add one or apply a template that includes materials.</div>
            ) : (
              <div className="divide-y">
                {data.manual.byMaterial.map((m) => (
                  <div key={m.name + m.unit} className="flex flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-[140px]">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground">{m.category ?? "Uncategorised"} · {m.plots} plot row{m.plots !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Expected</p>
                      <p className="font-medium">{m.expected.toLocaleString()} {m.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Delivered</p>
                      <p className="font-medium">{m.delivered.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Consumed</p>
                      <p className="font-medium">{m.consumed.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Cost</p>
                      <p className="font-medium">£{m.cost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-plot editable */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per plot (click delivered/consumed to edit)</div>
            {data.manual.perPlot.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No plot-level materials.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Plot</th>
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-3 py-2 text-right">Expected</th>
                      <th className="px-3 py-2 text-right">Delivered</th>
                      <th className="px-3 py-2 text-right">Consumed</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.manual.perPlot.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2">{m.plotNumber ? `Plot ${m.plotNumber}` : m.plotName}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{m.name}</span>
                          {m.category && <span className="ml-2 text-[11px] text-muted-foreground">· {m.category}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.quantity.toLocaleString()} {m.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            defaultValue={m.delivered}
                            className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== m.delivered) updatePerPlot(m, { delivered: v });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            defaultValue={m.consumed}
                            className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== m.consumed) updatePerPlot(m, { consumed: v });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.remaining.toLocaleString()}</td>
                        <td className="px-3 py-2 text-[11px] uppercase text-muted-foreground">{m.sourceType}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => deletePerPlot(m)} className="text-muted-foreground hover:text-destructive" title="Delete">
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "automated" && (
        <div className="rounded-xl border bg-card">
          {data.automated.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No job-based orders on this site.</div>
          ) : (
            <div className="divide-y">
              {data.automated.map((o) => (
                <div key={o.id} className="grid grid-cols-[1fr_100px_140px] gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{o.supplier}</p>
                    <p className="text-[11px] text-muted-foreground">{o.itemsDescription || "—"} · {o.jobName}{o.plot ? ` · Plot ${o.plot.plotNumber ?? ""}` : ""}</p>
                  </div>
                  <div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${o.status === "DELIVERED" ? "bg-green-100 text-green-700" : o.status === "ORDERED" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{o.status}</span>
                  </div>
                  <p className="text-right font-medium">£{o.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "oneoff" && (
        <div className="rounded-xl border bg-card">
          {data.oneOff.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No one-off orders yet. Click &quot;New one-off order&quot; to add extras not tied to a specific plot or job.</div>
          ) : (
            <div className="divide-y">
              {data.oneOff.map((o) => {
                const isPending = pendingStatusIds.has(o.id);
                const statusColour =
                  o.status === "DELIVERED" ? "bg-green-100 text-green-700"
                  : o.status === "ORDERED" ? "bg-blue-100 text-blue-700"
                  : o.status === "CANCELLED" ? "bg-slate-200 text-slate-600"
                  : "bg-amber-100 text-amber-700";
                return (
                  <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-[200px] flex-1">
                      <p className="font-medium">{o.supplier}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {o.itemsDescription || o.items.map((i) => i.name).join(", ") || "—"}
                        {o.plot ? ` · Plot ${o.plot.plotNumber ?? ""}` : " · Site-wide"}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColour}`}>{o.status}</span>
                    </div>
                    <p className="w-20 shrink-0 text-right font-medium tabular-nums">£{o.total.toFixed(2)}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {o.status === "PENDING" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-blue-200 px-2 text-[11px] text-blue-700 hover:bg-blue-50"
                                onClick={() => updateOneOffStatus(o.id, "ORDERED")}>
                                <Send className="size-3" /> Mark Sent
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"
                                onClick={() => updateOneOffStatus(o.id, "CANCELLED")}>
                                <X className="size-3" /> Cancel
                              </Button>
                            </>
                          )}
                          {o.status === "ORDERED" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-green-200 px-2 text-[11px] text-green-700 hover:bg-green-50"
                                onClick={() => updateOneOffStatus(o.id, "DELIVERED")}>
                                <Truck className="size-3" /> Mark Delivered
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"
                                onClick={() => updateOneOffStatus(o.id, "CANCELLED")}>
                                <X className="size-3" /> Cancel
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add manual dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add manual quant</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Plot</Label>
              <Select value={mPlotId} onValueChange={(v) => setMPlotId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select a plot…" /></SelectTrigger>
                <SelectContent>
                  {plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.plotNumber ? `Plot ${p.plotNumber}` : p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Material name</Label>
              <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="e.g. Bricks" />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={mQuantity} onChange={(e) => setMQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={mUnit} onChange={(e) => setMUnit(e.target.value)} placeholder="each / bags / m²" />
            </div>
            <div>
              <Label>Unit cost (£, optional)</Label>
              <Input type="number" step="0.01" value={mUnitCost} onChange={(e) => setMUnitCost(e.target.value)} />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Input value={mCategory} onChange={(e) => setMCategory(e.target.value)} placeholder="e.g. Brickwork" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={submitManual} disabled={mSubmitting || !mPlotId || !mName || !mQuantity}>
              {mSubmitting && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-off order dialog */}
      <Dialog open={oneOffOpen} onOpenChange={setOneOffOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New one-off order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Select value={oSupplierId} onValueChange={(v) => setOSupplierId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target</Label>
                <Select value={oPlotId} onValueChange={(v) => setOPlotId(v ?? "__site__")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__site__">Site-wide (no plot)</SelectItem>
                    {plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.plotNumber ? `Plot ${p.plotNumber}` : p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={oDesc} onChange={(e) => setODesc(e.target.value)} placeholder="e.g. Extra sand for the back of site" />
            </div>
            <div className="space-y-2">
              <Label>Items</Label>
              {oItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[2fr_80px_80px_100px_30px] gap-2">
                  <Input value={item.name} onChange={(e) => { const c = [...oItems]; c[i].name = e.target.value; setOItems(c); }} placeholder="Name" />
                  <Input type="number" value={item.quantity} onChange={(e) => { const c = [...oItems]; c[i].quantity = Number(e.target.value); setOItems(c); }} />
                  <Input value={item.unit} onChange={(e) => { const c = [...oItems]; c[i].unit = e.target.value; setOItems(c); }} placeholder="unit" />
                  <Input type="number" step="0.01" value={item.unitCost} onChange={(e) => { const c = [...oItems]; c[i].unitCost = Number(e.target.value); setOItems(c); }} placeholder="£" />
                  {oItems.length > 1 && (
                    <button onClick={() => setOItems(oItems.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOItems([...oItems, { name: "", quantity: 1, unit: "each", unitCost: 0 }])}>
                <Plus className="size-3" /> Add item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOneOffOpen(false)}>Cancel</Button>
            <Button onClick={submitOneOff} disabled={oSubmitting || !oSupplierId}>
              {oSubmitting && <Loader2 className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
