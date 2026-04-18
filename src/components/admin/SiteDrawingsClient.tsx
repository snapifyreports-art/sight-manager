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

export function SiteDrawingsClient({ siteId, plots }: { siteId: string; plots: Plot[] }) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadPlotId, setUploadPlotId] = useState("__site__");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);

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

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", uploadName || file.name);
      fd.append("category", "DRAWING");
      if (uploadPlotId !== "__site__") fd.append("plotId", uploadPlotId);
      const res = await fetch(`/api/sites/${siteId}/documents`, { method: "POST", body: fd });
      if (res.ok) {
        setUploadOpen(false);
        setUploadName(""); setUploadPlotId("__site__");
        if (fileRef.current) fileRef.current.value = "";
        refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Upload failed");
      }
    } finally { setUploading(false); }
  }

  async function deleteDrawing(d: Drawing) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    // SiteDocument DELETE endpoint
    await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    refresh();
  }

  function copyLink(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setLinkCopied(id);
    setTimeout(() => setLinkCopied(null), 1500);
  }

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
            {siteWide.map((d) => <DrawingRow key={d.id} d={d} onDelete={deleteDrawing} onCopy={copyLink} copied={linkCopied === d.id} />)}
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
                    {ds.map((d) => <DrawingRow key={d.id} d={d} onDelete={deleteDrawing} onCopy={copyLink} copied={linkCopied === d.id} compact />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload drawing</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>File</Label>
              <Input type="file" ref={fileRef} accept=".pdf,image/*,.dwg" />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Uses filename if blank" />
            </div>
            <div>
              <Label>Attach to</Label>
              <Select value={uploadPlotId} onValueChange={(v) => setUploadPlotId(v ?? "__site__")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__site__">Site-wide (visible on all plots)</SelectItem>
                  {plots.map((p) => <SelectItem key={p.id} value={p.id}>{p.plotNumber ? `Plot ${p.plotNumber}` : p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={upload} disabled={uploading}>
              {uploading && <Loader2 className="size-4 animate-spin" />}
              Upload
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
