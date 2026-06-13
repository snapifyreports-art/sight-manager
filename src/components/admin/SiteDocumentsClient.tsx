"use client";

// (Jun 2026 feature) Unified site Documents surface — the merge of the old
// separate "Drawings" and "Documents" tabs. Both always read from the one
// SiteDocument table via /api/sites/[id]/documents; "drawings" was just that
// list filtered to category=DRAWING. This component shows EVERY category with
// a filter sub-nav, groups by plot + site-wide, and its upload wizard files
// many documents across many plots AND categories in one pass.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Upload, Download, Trash2, Loader2, MapPin, ExternalLink, Share2, Check, Briefcase } from "lucide-react";
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
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useConfirm } from "@/hooks/useConfirm";

// Same vocabulary the upload form + handover ZIP folders use. "" = uncategorised.
const CATEGORIES: Array<[string, string]> = [
  ["DRAWING", "Drawing"],
  ["CERT", "Certificate"],
  ["SPEC", "Spec"],
  ["RAMS", "RAMS"],
  ["HANDOVER", "Handover"],
  ["OTHER", "Other"],
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);

function categoryLabel(value: string | null): string {
  if (!value) return "Uncategorised";
  return CATEGORY_LABEL[value] ?? value;
}

function categoryChipClass(value: string | null): string {
  switch (value) {
    case "DRAWING": return "bg-blue-50 text-blue-700 border-blue-200";
    case "CERT": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "SPEC": return "bg-violet-50 text-violet-700 border-violet-200";
    case "RAMS": return "bg-amber-50 text-amber-700 border-amber-200";
    case "HANDOVER": return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "OTHER": return "bg-slate-50 text-slate-700 border-slate-200";
    default: return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

interface Doc {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  plotId: string | null;
  jobId: string | null;
  plot: { id: string; plotNumber: string | null; name: string } | null;
  job: { id: string; name: string } | null;
  createdAt: string;
}
interface Plot { id: string; plotNumber: string | null; name: string }

// A single file queued for upload. Each row carries its own label, plot and
// category — so a manager can drag a whole folder in and file each correctly
// in one pass. "__site__" plot = site-wide.
interface PendingUpload {
  tempId: string;
  file: File;
  name: string;
  plotId: string;
  category: string; // "" = uncategorised
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

const FILTER_ALL = "__all__";

export function SiteDocumentsClient({
  siteId,
  plots,
  initialCategory,
}: {
  siteId: string;
  plots: Plot[];
  /** When set (e.g. the old "Drawings" tab), the list opens pre-filtered to
   *  this category and the upload wizard defaults new files to it. */
  initialCategory?: string;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [defaultPlotId, setDefaultPlotId] = useState("__site__");
  const [defaultCategory, setDefaultCategory] = useState(initialCategory ?? "");
  const [categoryFilter, setCategoryFilter] = useState(initialCategory ?? FILTER_ALL);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { copy, copiedKey } = useCopyToClipboard();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/documents`);
      if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
      setDocs(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/sites/${siteId}/documents`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load (HTTP ${r.status})`);
        return r.json();
      })
      .then((d) => { if (!cancelled) setDocs(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  // Per-category counts for the filter chips (always over the FULL set).
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of docs) {
      const key = d.category || "";
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [docs]);

  const filtered = useMemo(() => {
    if (categoryFilter === FILTER_ALL) return docs;
    return docs.filter((d) => (d.category || "") === categoryFilter);
  }, [docs, categoryFilter]);

  const { siteWide, byPlot } = useMemo(() => {
    const sw: Doc[] = [];
    const bp = new Map<string, Doc[]>();
    for (const d of filtered) {
      if (!d.plotId) sw.push(d);
      else bp.set(d.plotId, [...(bp.get(d.plotId) ?? []), d]);
    }
    return { siteWide: sw, byPlot: bp };
  }, [filtered]);

  function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const now = Date.now();
    const queued = Array.from(files).map((file, i) => ({
      tempId: `${now}-${i}`,
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      plotId: defaultPlotId,
      category: defaultCategory,
      status: "pending" as const,
    }));
    setPending((prev) => [...prev, ...queued]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updatePending(tempId: string, patch: Partial<PendingUpload>) {
    setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p)));
  }
  function removePending(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }
  // Apply the current default plot + category to EVERY queued (not-yet-done)
  // file — the "set all" affordance for a folder that's all one kind.
  function applyDefaultsToAll() {
    setPending((prev) =>
      prev.map((p) =>
        p.status === "uploading" || p.status === "done"
          ? p
          : { ...p, plotId: defaultPlotId, category: defaultCategory },
      ),
    );
  }

  async function uploadAll() {
    if (pending.length === 0 || uploading) return;
    setUploading(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      await Promise.all(
        pending.map(async (p) => {
          if (p.status === "done") return;
          updatePending(p.tempId, { status: "uploading", errorMsg: undefined });
          try {
            const fd = new FormData();
            fd.append("file", p.file);
            fd.append("name", p.name || p.file.name);
            if (p.category) fd.append("category", p.category);
            if (p.plotId !== "__site__") fd.append("plotId", p.plotId);
            const res = await fetch(`/api/sites/${siteId}/documents`, { method: "POST", body: fd });
            if (res.ok) {
              updatePending(p.tempId, { status: "done" });
              successCount++;
            } else {
              const data = await res.json().catch(() => ({}));
              updatePending(p.tempId, { status: "error", errorMsg: data.error ?? `HTTP ${res.status}` });
              errorCount++;
            }
          } catch (e) {
            updatePending(p.tempId, { status: "error", errorMsg: e instanceof Error ? e.message : "Network error" });
            errorCount++;
          }
        }),
      );
      if (successCount > 0) refresh();
      if (errorCount === 0) {
        setUploadOpen(false);
        setPending([]);
        setDefaultPlotId("__site__");
        setDefaultCategory(initialCategory ?? "");
      } else if (successCount > 0) {
        setPending((prev) => prev.filter((p) => p.status !== "done"));
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(d: Doc) {
    const ok = await confirm({
      title: `Delete "${d.name}"?`,
      body: "This document will be removed from the site. If a handover checklist references it, that item will become unchecked.",
      confirmLabel: "Delete document",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete document"));
      return;
    }
    refresh();
  }

  const copyLink = (url: string, id: string) => { void copy(url, id); };

  if (loading && docs.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />Loading documents…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Documents</h2>
          <p className="text-[11px] text-muted-foreground">
            Drawings, certificates, specs, RAMS and handover docs all live here. Upload at site level or attach to a plot — contractors see the docs for their plots.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}><Upload className="size-4" /> Upload</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Category filter sub-nav */}
      <div className="flex flex-wrap gap-1.5">
        {[[FILTER_ALL, "All"], ...CATEGORIES, ["", "Uncategorised"]].map(([value, label]) => {
          const n = value === FILTER_ALL ? docs.length : (counts[value] ?? 0);
          const active = categoryFilter === value;
          if (value !== FILTER_ALL && n === 0) return null; // hide empty buckets
          return (
            <button
              key={value || "uncat"}
              type="button"
              onClick={() => setCategoryFilter(value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label} <span className={active ? "text-white/70" : "text-muted-foreground"}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Site-wide */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site-wide ({siteWide.length})</div>
        {siteWide.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No site-wide documents{categoryFilter !== FILTER_ALL ? " in this category" : ""}.</p>
        ) : (
          <div className="divide-y">
            {siteWide.map((d) => <DocRow key={d.id} d={d} onDelete={deleteDoc} onCopy={copyLink} copied={copiedKey === d.id} />)}
          </div>
        )}
      </div>

      {/* Per plot */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plot documents ({filtered.length - siteWide.length})</div>
        {byPlot.size === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No plot-specific documents{categoryFilter !== FILTER_ALL ? " in this category" : ""}.</p>
        ) : (
          <div className="divide-y">
            {Array.from(byPlot.entries()).map(([plotId, ds]) => {
              const plot = plots.find((p) => p.id === plotId);
              return (
                <div key={plotId} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    <MapPin className="size-3 text-muted-foreground" />
                    {plot ? (plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name) : "Unknown plot"}
                    <span className="text-muted-foreground">· {ds.length} doc{ds.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-1">
                    {ds.map((d) => <DocRow key={d.id} d={d} onDelete={deleteDoc} onCopy={copyLink} copied={copiedKey === d.id} compact />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload wizard — many files, each with its own name, plot and category. */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) { setPending([]); setDefaultPlotId("__site__"); setDefaultCategory(initialCategory ?? ""); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload documents</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Defaults applied to newly-added files (and via "set all"). */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Default plot for new files</Label>
                <Select value={defaultPlotId} onValueChange={(v) => setDefaultPlotId(v ?? "__site__")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__site__">Site-wide (all plots)</SelectItem>
                    {plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.plotNumber ? `Plot ${p.plotNumber}` : p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default category</Label>
                <Select value={defaultCategory || "__uncat__"} onValueChange={(v) => setDefaultCategory(v === "__uncat__" ? "" : (v ?? ""))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__uncat__">Uncategorised</SelectItem>
                    {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Add files</Label>
              <Input
                type="file"
                ref={fileRef}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,image/*"
                multiple
                onChange={(e) => handleFilesPicked(e.target.files)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, Office docs, images or DWG · 50MB per file · Ctrl/Cmd-click to select many</p>
            </div>

            {pending.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-slate-50/40 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-muted-foreground">{pending.length} file{pending.length !== 1 ? "s" : ""} queued</p>
                  <button type="button" onClick={applyDefaultsToAll} className="text-[11px] font-medium text-blue-600 hover:underline">
                    Set all to defaults
                  </button>
                </div>
                {pending.map((p) => (
                  <div key={p.tempId} className="flex items-center gap-2 rounded bg-white px-2 py-1.5">
                    <FileText className="size-4 shrink-0 text-blue-600" />
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
                    <Select
                      value={p.category || "__uncat__"}
                      onValueChange={(v) => updatePending(p.tempId, { category: v === "__uncat__" ? "" : (v ?? "") })}
                      disabled={p.status === "uploading" || p.status === "done"}
                    >
                      <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__uncat__">Uncategorised</SelectItem>
                        {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value={p.plotId}
                      onValueChange={(v) => updatePending(p.tempId, { plotId: v ?? "__site__" })}
                      disabled={p.status === "uploading" || p.status === "done"}
                    >
                      <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__site__">Site-wide</SelectItem>
                        {plots.map((pl) => <SelectItem key={pl.id} value={pl.id}>{pl.plotNumber ? `Plot ${pl.plotNumber}` : pl.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={uploadAll} disabled={uploading || pending.length === 0}>
              {uploading && <Loader2 className="size-4 animate-spin" />}
              Upload {pending.length > 0 ? `${pending.length} file${pending.length !== 1 ? "s" : ""}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocRow({ d, onDelete, onCopy, copied, compact }: { d: Doc; onDelete: (d: Doc) => void; onCopy: (url: string, id: string) => void; copied: boolean; compact?: boolean }) {
  const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "py-1.5" : "px-4 py-2.5"}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FileText className="size-4 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{d.name}</p>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${categoryChipClass(d.category)}`}>
              {categoryLabel(d.category)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {d.fileName}{sizeKb !== null ? ` · ${sizeKb} KB` : ""} · {new Date(d.createdAt).toLocaleDateString("en-GB")}
            {d.job && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                · <Briefcase className="size-2.5" /> {d.job.name}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Open"
          aria-label="Open document in new tab"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens in new tab)</span>
        </a>
        <a
          href={d.url}
          download={d.fileName}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Download"
          aria-label="Download document"
        >
          <Download className="size-4" aria-hidden="true" />
        </a>
        <button
          onClick={() => onCopy(d.url, d.id)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Copy share link"
          aria-label={copied ? "Share link copied" : "Copy share link"}
        >
          {copied ? <Check className="size-4 text-green-600" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
        </button>
        <button
          onClick={() => onDelete(d)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          title="Delete"
          aria-label="Delete document"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
