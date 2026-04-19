"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Upload, Download, Trash2, Loader2, MapPin, ExternalLink, Share2, Copy, Check } from "lucide-react";
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

interface Drawing {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  plotId: string | null;
  plot: { id: string; plotNumber: string | null; name: string } | null;
  createdAt: string;
}
interface Plot { id: string; plotNumber: string | null; name: string }

// A single file queued for upload. Starts with the OS filename as its
// label and the picker's default plot assignment; user can edit both
// before confirming. "pending" / "done" / "error" tracks the per-file
// state once upload starts.
interface PendingUpload {
  tempId: string;
  file: File;
  name: string;
  plotId: string; // "__site__" means site-wide
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

export function SiteDrawingsClient({ siteId, plots }: { siteId: string; plots: Plot[] }) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [defaultPlotId, setDefaultPlotId] = useState("__site__");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { copy, copiedKey } = useCopyToClipboard();
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/documents?category=DRAWING`);
      if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
      setDrawings(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { refresh(); }, [refresh]);

  const { siteWide, byPlot } = useMemo(() => {
    const sw: Drawing[] = [];
    const bp = new Map<string, Drawing[]>();
    for (const d of drawings) {
      if (!d.plotId) sw.push(d);
      else {
        const k = d.plotId;
        bp.set(k, [...(bp.get(k) ?? []), d]);
      }
    }
    return { siteWide: sw, byPlot: bp };
  }, [drawings]);

  // When the user picks files, queue them with default name + plot.
  function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const now = Date.now();
    const queued = Array.from(files).map((file, i) => ({
      tempId: `${now}-${i}`,
      file,
      // Strip extension for a nicer default label
      name: file.name.replace(/\.[^.]+$/, ""),
      plotId: defaultPlotId,
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

  // Upload every queued file in parallel. Per-file status + error tracked so
  // a partial failure shows which files didn't make it. 50MB/file limit is
  // enforced server-side; we echo the filename back in the error.
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
            fd.append("category", "DRAWING");
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
        })
      );
      if (successCount > 0) refresh();
      if (errorCount === 0) {
        setUploadOpen(false);
        setPending([]);
        setDefaultPlotId("__site__");
      } else if (successCount > 0) {
        // Partial success — keep dialog open so user can see which failed, but
        // drop the completed rows so they can retry only the failures.
        setPending((prev) => prev.filter((p) => p.status !== "done"));
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteDrawing(d: Drawing) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    // SiteDocument DELETE endpoint
    const res = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete drawing"));
      return;
    }
    refresh();
  }

  // Wraps useCopyToClipboard for the drawing-row signature the component uses.
  const copyLink = (url: string, id: string) => { void copy(url, id); };

  if (loading && drawings.length === 0) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin mr-2" />Loading drawings…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Drawings</h2>
          <p className="text-[11px] text-muted-foreground">Upload at site level or attach to a specific plot. Contractors see drawings for their plots.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}><Upload className="size-4" /> Upload</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Site-wide */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site-wide drawings ({siteWide.length})</div>
        {siteWide.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No site-wide drawings uploaded.</p>
        ) : (
          <div className="divide-y">
            {siteWide.map((d) => <DrawingRow key={d.id} d={d} onDelete={deleteDrawing} onCopy={copyLink} copied={copiedKey === d.id} />)}
          </div>
        )}
      </div>

      {/* Per plot */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plot drawings ({drawings.length - siteWide.length})</div>
        {byPlot.size === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No plot-specific drawings.</p>
        ) : (
          <div className="divide-y">
            {Array.from(byPlot.entries()).map(([plotId, ds]) => {
              const plot = plots.find((p) => p.id === plotId);
              return (
                <div key={plotId} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    <MapPin className="size-3 text-muted-foreground" />
                    {plot ? (plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name) : "Unknown plot"}
                    <span className="text-muted-foreground">· {ds.length} drawing{ds.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-1">
                    {ds.map((d) => <DrawingRow key={d.id} d={d} onDelete={deleteDrawing} onCopy={copyLink} copied={copiedKey === d.id} compact />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload dialog — supports multiple files at once, each with its own
          label and per-file plot assignment. */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) { setPending([]); setDefaultPlotId("__site__"); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload drawings</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Default plot for newly-added files. Can be overridden per file. */}
            <div>
              <Label className="text-xs">Default plot for new files</Label>
              <Select value={defaultPlotId} onValueChange={(v) => setDefaultPlotId(v ?? "__site__")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__site__">Site-wide (visible on all plots)</SelectItem>
                  {plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.plotNumber ? `Plot ${p.plotNumber}` : p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* File picker — multiple */}
            <div>
              <Label className="text-xs">Add files</Label>
              <Input
                type="file"
                ref={fileRef}
                accept=".pdf,image/*,.dwg"
                multiple
                onChange={(e) => handleFilesPicked(e.target.files)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, images, or DWG · 50MB per file max · select multiple with Ctrl/Cmd-click</p>
            </div>

            {/* Queued files list — each row editable */}
            {pending.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-slate-50/40 p-2">
                <p className="text-[11px] font-medium text-muted-foreground">{pending.length} file{pending.length !== 1 ? "s" : ""} queued</p>
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
                      value={p.plotId}
                      onValueChange={(v) => updatePending(p.tempId, { plotId: v ?? "__site__" })}
                      disabled={p.status === "uploading" || p.status === "done"}
                    >
                      <SelectTrigger className="h-7 w-40 text-[11px]"><SelectValue /></SelectTrigger>
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

function DrawingRow({ d, onDelete, onCopy, copied, compact }: { d: Drawing; onDelete: (d: Drawing) => void; onCopy: (url: string, id: string) => void; copied: boolean; compact?: boolean }) {
  const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "py-1.5" : "px-4 py-2.5"}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FileText className="size-4 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{d.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {d.fileName}{sizeKb !== null ? ` · ${sizeKb} KB` : ""} · {new Date(d.createdAt).toLocaleDateString("en-GB")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open">
          <ExternalLink className="size-4" />
        </a>
        <a href={d.url} download={d.fileName} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Download">
          <Download className="size-4" />
        </a>
        <button onClick={() => onCopy(d.url, d.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copy share link">
          {copied ? <Check className="size-4 text-green-600" /> : <Share2 className="size-4" />}
        </button>
        <button onClick={() => onDelete(d)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
