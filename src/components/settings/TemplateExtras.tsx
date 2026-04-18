"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Package, FileText, Plus, Loader2, Trash2, Upload, ExternalLink, Download } from "lucide-react";
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

/**
 * Compact Materials + Drawings sections for a PlotTemplate.
 * Mount alongside TemplateEditor. Changes here do NOT affect existing plots
 * already created from the template (snapshot behaviour).
 */

interface TemplateMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  category: string | null;
  notes: string | null;
  linkedStageCode: string | null;
}
interface TemplateDocument {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  createdAt: string;
}

export function TemplateExtras({ templateId, templateName }: { templateId: string; templateName: string }) {
  const [materials, setMaterials] = useState<TemplateMaterial[]>([]);
  const [documents, setDocuments] = useState<TemplateDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Material add dialog
  const [mOpen, setMOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mQuantity, setMQuantity] = useState("");
  const [mUnit, setMUnit] = useState("each");
  const [mUnitCost, setMUnitCost] = useState("");
  const [mCategory, setMCategory] = useState("");
  const [mSubmitting, setMSubmitting] = useState(false);

  // Doc upload dialog
  const [dOpen, setDOpen] = useState(false);
  const [dName, setDName] = useState("");
  const [dSubmitting, setDSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, dRes] = await Promise.all([
      fetch(`/api/plot-templates/${templateId}/materials`),
      fetch(`/api/plot-templates/${templateId}/documents`),
    ]);
    if (mRes.ok) setMaterials(await mRes.json());
    if (dRes.ok) setDocuments(await dRes.json());
    setLoading(false);
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  async function addMaterial() {
    if (!mName || !mQuantity) return;
    setMSubmitting(true);
    try {
      const res = await fetch(`/api/plot-templates/${templateId}/materials`, {
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
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to add material"));
        return;
      }
      setMOpen(false);
      setMName(""); setMQuantity(""); setMUnitCost(""); setMCategory("");
      load();
    } finally { setMSubmitting(false); }
  }

  async function deleteMaterial(id: string) {
    if (!confirm("Delete this material from the template?")) return;
    const res = await fetch(`/api/plot-templates/${templateId}/materials/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete material"));
      return;
    }
    load();
  }

  async function updateMaterialField(m: TemplateMaterial, patch: Partial<Pick<TemplateMaterial, "quantity" | "unitCost" | "unit">>) {
    const res = await fetch(`/api/plot-templates/${templateId}/materials/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to update material"));
      return;
    }
    load();
  }

  async function uploadDoc() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setDSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", dName || f.name);
      fd.append("category", "DRAWING");
      const res = await fetch(`/api/plot-templates/${templateId}/documents`, { method: "POST", body: fd });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to upload drawing"));
        return;
      }
      setDOpen(false);
      setDName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } finally { setDSubmitting(false); }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this drawing from the template?")) return;
    const res = await fetch(`/api/plot-templates/${templateId}/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete drawing"));
      return;
    }
    load();
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin mr-2" />Loading extras…</div>;

  return (
    <div className="space-y-6 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Template extras for {templateName}</h2>
        <p className="text-[11px] text-muted-foreground">Materials + drawings copied to each plot on apply. Editing here only affects NEW plots; existing plots keep their original snapshot.</p>
      </div>

      {/* Materials */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Quants / Materials ({materials.length})</h3>
          </div>
          <Button size="sm" onClick={() => setMOpen(true)}><Plus className="size-3.5" /> Add</Button>
        </div>
        {materials.length === 0 ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            No materials yet. Add ones that aren&apos;t tracked via orders (bricks, mortar, blocks…). Each plot made from this template will inherit these quantities.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">Name</th>
                  <th className="px-3 py-1.5 text-left">Category</th>
                  <th className="px-3 py-1.5 text-right">Qty</th>
                  <th className="px-3 py-1.5 text-left">Unit</th>
                  <th className="px-3 py-1.5 text-right">£/unit</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {materials.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{m.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{m.category ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <input type="number" defaultValue={m.quantity}
                        className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== m.quantity) updateMaterialField(m, { quantity: v }); }}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="text" defaultValue={m.unit}
                        className="w-16 rounded border border-input bg-transparent px-1.5 py-0.5"
                        onBlur={(e) => { if (e.target.value !== m.unit) updateMaterialField(m, { unit: e.target.value }); }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input type="number" step="0.01" defaultValue={m.unitCost ?? ""}
                        className="w-20 rounded border border-input bg-transparent px-1.5 py-0.5 text-right tabular-nums"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== m.unitCost) updateMaterialField(m, { unitCost: v ?? undefined });
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => deleteMaterial(m.id)} className="text-muted-foreground hover:text-destructive">
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

      {/* Drawings */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Drawings ({documents.length})</h3>
          </div>
          <Button size="sm" onClick={() => setDOpen(true)}><Upload className="size-3.5" /> Upload</Button>
        </div>
        {documents.length === 0 ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            No drawings yet. Upload PDFs or images (floor plans, site layouts) — each plot made from this template gets a copy.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {documents.map((d) => {
              const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
              return (
                <div key={d.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">{d.fileName}{sizeKb ? ` · ${sizeKb} KB` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open"><ExternalLink className="size-4" /></a>
                    <a href={d.url} download={d.fileName} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Download"><Download className="size-4" /></a>
                    <button onClick={() => deleteDoc(d.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add material dialog */}
      <Dialog open={mOpen} onOpenChange={setMOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add material to template</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="e.g. Facing Bricks" />
            </div>
            <div>
              <Label>Quantity per plot</Label>
              <Input type="number" value={mQuantity} onChange={(e) => setMQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={mUnit} onChange={(e) => setMUnit(e.target.value)} />
            </div>
            <div>
              <Label>£/unit (optional)</Label>
              <Input type="number" step="0.01" value={mUnitCost} onChange={(e) => setMUnitCost(e.target.value)} />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Input value={mCategory} onChange={(e) => setMCategory(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMOpen(false)}>Cancel</Button>
            <Button onClick={addMaterial} disabled={mSubmitting || !mName || !mQuantity}>
              {mSubmitting && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload doc dialog */}
      <Dialog open={dOpen} onOpenChange={setDOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload drawing to template</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>File</Label>
              <Input type="file" ref={fileRef} accept=".pdf,image/*,.dwg" />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Uses filename if blank" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDOpen(false)}>Cancel</Button>
            <Button onClick={uploadDoc} disabled={dSubmitting}>
              {dSubmitting && <Loader2 className="size-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
