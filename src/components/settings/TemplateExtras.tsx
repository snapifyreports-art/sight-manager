"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Package, FileText, Plus, Loader2, Trash2, Upload, ExternalLink, Download, ClipboardCheck } from "lucide-react";
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
  /** True for cloned-template placeholder rows that have no storage object yet. */
  isPlaceholder?: boolean;
  createdAt: string;
}
interface TemplateInspectionRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  anchorTemplateJobId: string;
  anchorEdge: string;
  offsetDays: number;
  bookingLeadWeeks: number | null;
  sortOrder: number;
  anchorJob: { id: string; name: string; stageCode: string | null } | null;
  defaultInspectorContactId: string | null;
  defaultInspector: { id: string; name: string } | null;
  isBlocking: boolean;
}
interface ContactOption {
  id: string;
  name: string;
}
interface AnchorJobRow {
  id: string;
  name: string;
  stageCode: string | null;
  parentId: string | null;
  sortOrder: number;
}

const INSPECTION_TYPES = [
  { value: "NHBC", label: "NHBC" },
  { value: "BUILDING_CONTROL", label: "Building Control / LABC" },
  { value: "WARRANTY_CML", label: "Warranty / CML" },
  { value: "INTERNAL_QA", label: "Internal QA" },
  { value: "OTHER", label: "Other" },
] as const;
const inspectionTypeLabel = (t: string) =>
  INSPECTION_TYPES.find((x) => x.value === t)?.label ?? t;

export function TemplateExtras({
  templateId,
  templateName,
  variantId = null,
}: {
  templateId: string;
  templateName: string;
  variantId?: string | null;
}) {
  // ?variantId=X scopes every read + write to that variant. Null = base.
  const variantQ = variantId ? `?variantId=${variantId}` : "";
  const [materials, setMaterials] = useState<TemplateMaterial[]>([]);
  const [documents, setDocuments] = useState<TemplateDocument[]>([]);
  const [inspections, setInspections] = useState<TemplateInspectionRow[]>([]);
  const [anchorJobs, setAnchorJobs] = useState<AnchorJobRow[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Inspection add dialog
  const [iOpen, setIOpen] = useState(false);
  const [iName, setIName] = useState("");
  const [iType, setIType] = useState<string>("NHBC");
  const [iAnchorJobId, setIAnchorJobId] = useState("");
  const [iAnchorEdge, setIAnchorEdge] = useState<"START" | "END">("END");
  const [iOffsetDays, setIOffsetDays] = useState("0");
  const [iBookingLeadWeeks, setIBookingLeadWeeks] = useState("");
  const [iInspectorId, setIInspectorId] = useState("");
  const [iIsBlocking, setIIsBlocking] = useState(false);
  const [iSubmitting, setISubmitting] = useState(false);

  // Material add dialog
  const [mOpen, setMOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mQuantity, setMQuantity] = useState("");
  const [mUnit, setMUnit] = useState("each");
  const [mUnitCost, setMUnitCost] = useState("");
  const [mCategory, setMCategory] = useState("");
  const [mSubmitting, setMSubmitting] = useState(false);

  // Doc upload dialog — multi-file with per-file labels
  const [dOpen, setDOpen] = useState(false);
  const [dSubmitting, setDSubmitting] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<Array<{
    tempId: string;
    file: File;
    name: string;
    status: "pending" | "uploading" | "done" | "error";
    errorMsg?: string;
  }>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, dRes, iRes, jRes, cRes] = await Promise.all([
      fetch(`/api/plot-templates/${templateId}/materials${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/documents${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/inspections${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/jobs${variantQ}`),
      fetch(`/api/contacts`),
    ]);
    if (mRes.ok) setMaterials(await mRes.json());
    if (dRes.ok) setDocuments(await dRes.json());
    if (iRes.ok) setInspections(await iRes.json());
    if (jRes.ok) setAnchorJobs(await jRes.json());
    if (cRes.ok) {
      const all = await cRes.json();
      setContacts(
        (Array.isArray(all) ? all : []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
      );
    }
    setLoading(false);
  }, [templateId, variantQ]);

  // (May 2026 pattern sweep) Cancellation flag for template-switch race.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/plot-templates/${templateId}/materials${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/documents${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/inspections${variantQ}`),
      fetch(`/api/plot-templates/${templateId}/jobs${variantQ}`),
      fetch(`/api/contacts`),
    ]).then(async ([mRes, dRes, iRes, jRes, cRes]) => {
      if (cancelled) return;
      if (mRes.ok) setMaterials(await mRes.json());
      if (cancelled) return;
      if (dRes.ok) setDocuments(await dRes.json());
      if (cancelled) return;
      if (iRes.ok) setInspections(await iRes.json());
      if (cancelled) return;
      if (jRes.ok) setAnchorJobs(await jRes.json());
      if (cancelled) return;
      if (cRes.ok) {
        const all = await cRes.json();
        setContacts(
          (Array.isArray(all) ? all : []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
        );
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [templateId, variantQ]);

  // Quick-fix listener — the validation panel emits `template-action`
  // events with `kind: "add-material"` or `"upload-drawing"`. We open
  // the right dialog and scroll the section into view.
  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<{ kind?: string }>).detail;
      if (!detail) return;
      if (detail.kind === "add-material") {
        const el = document.getElementById("template-extras-materials");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        setMOpen(true);
      } else if (detail.kind === "upload-drawing") {
        const el = document.getElementById("template-extras-drawings");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        setDOpen(true);
      }
    }
    window.addEventListener("template-action", handle);
    return () => window.removeEventListener("template-action", handle);
  }, []);

  async function addMaterial() {
    if (!mName || !mQuantity) return;
    setMSubmitting(true);
    try {
      const res = await fetch(`/api/plot-templates/${templateId}/materials${variantQ}`, {
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
    const ok = await confirm({
      title: "Delete this material from the template?",
      body: "Plots already created from this template aren't affected — only future applies.",
      confirmLabel: "Delete material",
      danger: true,
    });
    if (!ok) return;
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

  async function addInspection() {
    if (!iName || !iAnchorJobId) return;
    setISubmitting(true);
    try {
      const res = await fetch(`/api/plot-templates/${templateId}/inspections${variantQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: iName,
          type: iType,
          anchorTemplateJobId: iAnchorJobId,
          anchorEdge: iAnchorEdge,
          offsetDays: Number(iOffsetDays) || 0,
          bookingLeadWeeks: iBookingLeadWeeks ? Number(iBookingLeadWeeks) : null,
          defaultInspectorContactId: iInspectorId || null,
          isBlocking: iIsBlocking,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to add inspection"));
        return;
      }
      setIOpen(false);
      setIName(""); setIAnchorJobId(""); setIOffsetDays("0"); setIBookingLeadWeeks(""); setIInspectorId(""); setIIsBlocking(false);
      load();
    } finally { setISubmitting(false); }
  }

  async function deleteInspection(id: string) {
    const ok = await confirm({
      title: "Delete this inspection from the template?",
      body: "Plots already created from this template aren't affected — only future applies.",
      confirmLabel: "Delete inspection",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/plot-templates/${templateId}/inspections/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete inspection"));
      return;
    }
    load();
  }

  function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const now = Date.now();
    const queued = Array.from(files).map((file, i) => ({
      tempId: `${now}-${i}`,
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      status: "pending" as const,
    }));
    setPendingDocs((prev) => [...prev, ...queued]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updatePending(tempId: string, patch: Partial<(typeof pendingDocs)[number]>) {
    setPendingDocs((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p)));
  }

  function removePending(tempId: string) {
    setPendingDocs((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  // Upload all queued files in parallel. Per-file status tracked so partial
  // failures (e.g. one oversize file) don't block the rest.
  //
  // Uses a 3-step signed-upload flow (sign → upload direct to Supabase →
  // register) so large drawings bypass Vercel's 4.5MB request body limit.
  // Site managers upload 10-30MB PDFs routinely; the old single-POST-to-
  // Vercel route 413'd on anything above ~4MB.
  async function uploadDocs() {
    if (pendingDocs.length === 0 || dSubmitting) return;
    setDSubmitting(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      await Promise.all(
        pendingDocs.map(async (p) => {
          if (p.status === "done") return;
          updatePending(p.tempId, { status: "uploading", errorMsg: undefined });
          try {
            // 1. Ask the server for a signed upload URL.
            const signRes = await fetch(
              `/api/plot-templates/${templateId}/documents/sign`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fileName: p.file.name,
                  fileSize: p.file.size,
                  mimeType: p.file.type,
                }),
              }
            );
            if (!signRes.ok) {
              const data = await signRes.json().catch(() => ({}));
              const friendly =
                signRes.status === 413
                  ? data.error ?? `File too large (max 50MB)`
                  : data.error ?? `Could not start upload (HTTP ${signRes.status})`;
              throw new Error(friendly);
            }
            const { signedUrl, storagePath } = (await signRes.json()) as {
              signedUrl: string;
              token: string;
              storagePath: string;
            };

            // 2. Upload bytes directly to Supabase Storage — the signed URL
            //    accepts a PUT with multipart/form-data (matches what the
            //    official SDK's uploadToSignedUrl does). Raw-body PUT gets
            //    rejected by the Storage server with a 400.
            const fd = new FormData();
            fd.append("cacheControl", "3600");
            // Empty-string key is what the Supabase SDK uses for the file field.
            fd.append("", p.file);
            const putRes = await fetch(signedUrl, {
              method: "PUT",
              headers: { "x-upsert": "false" },
              body: fd,
            });
            if (!putRes.ok) {
              throw new Error(
                `Upload to storage failed (HTTP ${putRes.status}). Check your connection and try again.`
              );
            }

            // 3. Register the DB row (variant-scoped if variantId set).
            const regRes = await fetch(
              `/api/plot-templates/${templateId}/documents/register${variantQ}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  storagePath,
                  name: p.name || p.file.name,
                  fileName: p.file.name,
                  fileSize: p.file.size,
                  mimeType: p.file.type,
                  category: "DRAWING",
                }),
              }
            );
            if (!regRes.ok) {
              const data = await regRes.json().catch(() => ({}));
              throw new Error(data.error ?? `Could not save drawing (HTTP ${regRes.status})`);
            }

            updatePending(p.tempId, { status: "done" });
            successCount++;
          } catch (e) {
            updatePending(p.tempId, {
              status: "error",
              errorMsg: e instanceof Error ? e.message : "Network error",
            });
            errorCount++;
          }
        })
      );
      if (successCount > 0) load();
      if (errorCount === 0) {
        setDOpen(false);
        setPendingDocs([]);
      } else if (successCount > 0) {
        setPendingDocs((prev) => prev.filter((p) => p.status !== "done"));
      }
    } finally {
      setDSubmitting(false);
    }
  }

  async function deleteDoc(id: string) {
    const ok = await confirm({
      title: "Delete this drawing from the template?",
      body: "Plots already created from this template aren't affected.",
      confirmLabel: "Delete drawing",
      danger: true,
    });
    if (!ok) return;
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
      {confirmDialog}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Template extras for {templateName}</h2>
        <p className="text-[11px] text-muted-foreground">Materials + drawings copied to each plot on apply. Editing here only affects NEW plots; existing plots keep their original snapshot.</p>
      </div>

      {/* Materials — id used by the validation panel's quick-fix
          "Add material" button. */}
      <div id="template-extras-materials" className="scroll-mt-20">
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
              {(() => {
                const total = materials.reduce(
                  (sum, m) => sum + (m.unitCost ?? 0) * (m.quantity || 0),
                  0,
                );
                const priced = materials.filter((m) => m.unitCost != null);
                if (total === 0) return null;
                return (
                  <tfoot className="border-t bg-muted/20 text-xs">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 font-medium">
                        Materials cost per plot
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({priced.length} of {materials.length} priced)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {new Intl.NumberFormat("en-GB", {
                          style: "currency",
                          currency: "GBP",
                          maximumFractionDigits: total % 1 === 0 ? 0 : 2,
                        }).format(total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}
      </div>

      {/* Inspections — first-class hold-points anchored to a job. They
          move with that job, don't block the programme, and drive
          booking/prep alerts + handover certs. */}
      <div id="template-extras-inspections" className="scroll-mt-20">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Inspections ({inspections.length})</h3>
          </div>
          <Button size="sm" onClick={() => setIOpen(true)} disabled={anchorJobs.length === 0}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {inspections.length === 0 ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            No inspections yet. Add hold-points (NHBC, Building Control, CML…) anchored to a job — they move with that job, don&apos;t block the programme, and alert the site manager to book + prep.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">Name</th>
                  <th className="px-3 py-1.5 text-left">Type</th>
                  <th className="px-3 py-1.5 text-left">Anchored to</th>
                  <th className="px-3 py-1.5 text-left">Inspector</th>
                  <th className="px-3 py-1.5 text-left">Book ahead</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inspections.map((ins) => (
                  <tr key={ins.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">
                      {ins.name}
                      {ins.isBlocking && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700" title="Hard blocker — blocks completing the anchor job while open">
                          blocks
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{inspectionTypeLabel(ins.type)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {ins.anchorJob?.name ?? "—"}
                      <span className="text-[11px]">
                        {" "}· {ins.anchorEdge === "END" ? "end" : "start"}
                        {ins.offsetDays ? ` ${ins.offsetDays > 0 ? "+" : ""}${ins.offsetDays}d` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{ins.defaultInspector?.name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{ins.bookingLeadWeeks ? `${ins.bookingLeadWeeks} wk` : "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => deleteInspection(ins.id)} className="text-muted-foreground hover:text-destructive">
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

      {/* Drawings — id used by the validation panel's quick-fix
          "Upload drawing" button. */}
      <div id="template-extras-drawings" className="scroll-mt-20">
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
              const isPlaceholder = !!d.isPlaceholder;
              return (
                <div
                  key={d.id}
                  className={`flex items-center justify-between px-3 py-2 ${
                    isPlaceholder ? "bg-amber-50/40" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText
                      className={`size-4 shrink-0 ${
                        isPlaceholder ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {isPlaceholder ? (
                          <>
                            <span className="font-medium text-amber-800">
                              Re-upload needed
                            </span>{" "}
                            — original was {d.fileName}
                            {sizeKb ? ` · ${sizeKb} KB` : ""}
                          </>
                        ) : (
                          <>
                            {d.fileName}
                            {sizeKb ? ` · ${sizeKb} KB` : ""}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isPlaceholder ? null : (
                      <>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open"><ExternalLink className="size-4" /></a>
                        <a href={d.url} download={d.fileName} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Download"><Download className="size-4" /></a>
                      </>
                    )}
                    <button onClick={() => deleteDoc(d.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title={isPlaceholder ? "Remove placeholder" : "Delete"}><Trash2 className="size-4" /></button>
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

      {/* Add inspection dialog */}
      <Dialog open={iOpen} onOpenChange={setIOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add inspection to template</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={iName} onChange={(e) => setIName(e.target.value)} placeholder="e.g. NHBC Superstructure" />
            </div>
            <div>
              <Label>Type</Label>
              <select
                value={iType}
                onChange={(e) => setIType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {INSPECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Anchored to job</Label>
              <select
                value={iAnchorJobId}
                onChange={(e) => setIAnchorJobId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Select a job…</option>
                {anchorJobs
                  .filter((j) => !j.parentId)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((stage) => {
                    const kids = anchorJobs
                      .filter((j) => j.parentId === stage.id)
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    return (
                      <optgroup key={stage.id} label={stage.name}>
                        <option value={stage.id}>{stage.name} (whole stage)</option>
                        {kids.map((k) => (
                          <option key={k.id} value={k.id}>— {k.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
              </select>
            </div>
            <div>
              <Label>When</Label>
              <select
                value={iAnchorEdge}
                onChange={(e) => setIAnchorEdge(e.target.value as "START" | "END")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="END">At job end</option>
                <option value="START">At job start</option>
              </select>
            </div>
            <div>
              <Label>Offset (working days ±)</Label>
              <Input type="number" value={iOffsetDays} onChange={(e) => setIOffsetDays(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Book ahead (weeks, optional)</Label>
              <Input
                type="number"
                value={iBookingLeadWeeks}
                onChange={(e) => setIBookingLeadWeeks(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div>
              <Label>Default inspector (optional)</Label>
              <select
                value={iInspectorId}
                onChange={(e) => setIInspectorId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Unassigned</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <label className="col-span-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-sm">
              <input
                type="checkbox"
                checked={iIsBlocking}
                onChange={(e) => setIIsBlocking(e.target.checked)}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span>
                <span className="font-medium">Hard blocker</span>
                <span className="block text-[11px] text-muted-foreground">
                  Block completing the anchor job while this inspection is open (manager can override with a reason). Leave off for a reminder only.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIOpen(false)}>Cancel</Button>
            <Button onClick={addInspection} disabled={iSubmitting || !iName || !iAnchorJobId}>
              {iSubmitting && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload doc dialog — multi-file with per-file labels */}
      <Dialog open={dOpen} onOpenChange={(o) => { setDOpen(o); if (!o) setPendingDocs([]); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Upload drawings to template</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Add files</Label>
              <Input
                type="file"
                ref={fileRef}
                accept=".pdf,image/*,.dwg"
                multiple
                onChange={(e) => handleFilesPicked(e.target.files)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, images, or DWG · up to 500MB per file · select multiple with Ctrl/Cmd-click</p>
            </div>
            {pendingDocs.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-slate-50/40 p-2">
                <p className="text-[11px] font-medium text-muted-foreground">{pendingDocs.length} file{pendingDocs.length !== 1 ? "s" : ""} queued</p>
                {pendingDocs.map((p) => (
                  <div key={p.tempId} className="flex items-center gap-2 rounded bg-white px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <Input
                        value={p.name}
                        onChange={(e) => updatePending(p.tempId, { name: e.target.value })}
                        placeholder={p.file.name}
                        className="h-7 text-xs"
                        disabled={p.status === "uploading" || p.status === "done"}
                      />
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {p.file.name} · {Math.round(p.file.size / 1024)} KB
                        {p.status === "error" && p.errorMsg && <span className="ml-1 text-red-600">— {p.errorMsg}</span>}
                        {p.status === "done" && <span className="ml-1 text-green-600">— uploaded</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(p.tempId)}
                      className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-destructive disabled:opacity-50"
                      disabled={p.status === "uploading"}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDOpen(false)} disabled={dSubmitting}>Cancel</Button>
            <Button onClick={uploadDocs} disabled={dSubmitting || pendingDocs.length === 0}>
              {dSubmitting && <Loader2 className="size-4 animate-spin" />}
              Upload {pendingDocs.length > 0 ? `${pendingDocs.length} file${pendingDocs.length !== 1 ? "s" : ""}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
