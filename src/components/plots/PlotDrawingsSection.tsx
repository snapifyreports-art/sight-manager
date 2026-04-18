"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Upload, Download, Trash2, Loader2, ExternalLink, Share2, Check, MapPin, Building2 } from "lucide-react";
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

export function PlotDrawingsSection({ plotId, siteId }: { plotId: string; siteId: string }) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/documents?plotId=${plotId}&category=DRAWING`);
      if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
      setDrawings(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId, plotId]);

  useEffect(() => { refresh(); }, [refresh]);

  const { plotSpecific, siteWide } = useMemo(() => {
    const ps: Drawing[] = [];
    const sw: Drawing[] = [];
    for (const d of drawings) {
      if (d.plotId === plotId) ps.push(d);
      else sw.push(d);
    }
    return { plotSpecific: ps, siteWide: sw };
  }, [drawings, plotId]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", uploadName || file.name);
      fd.append("category", "DRAWING");
      fd.append("plotId", plotId);
      const res = await fetch(`/api/sites/${siteId}/documents`, { method: "POST", body: fd });
      if (res.ok) {
        setUploadOpen(false);
        setUploadName("");
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
    const res = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete drawing"));
      return;
    }
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
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-blue-600" /> Drawings ({drawings.length})
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Site-wide drawings apply to all plots. Plot drawings are specific to this plot.
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" /> Upload
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Plot-specific drawings */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-1.5 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3" />
          Plot drawings ({plotSpecific.length})
        </div>
        {plotSpecific.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No drawings specific to this plot. Upload one using the button above.
          </p>
        ) : (
          <div className="divide-y">
            {plotSpecific.map((d) => (
              <DrawingRow
                key={d.id}
                d={d}
                onDelete={deleteDrawing}
                onCopy={copyLink}
                copied={linkCopied === d.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Site-wide drawings (read-only here — managed in Site Admin) */}
      {siteWide.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-1.5 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="size-3" />
            Site-wide drawings ({siteWide.length})
          </div>
          <div className="divide-y">
            {siteWide.map((d) => (
              <DrawingRow
                key={d.id}
                d={d}
                onDelete={deleteDrawing}
                onCopy={copyLink}
                copied={linkCopied === d.id}
                readOnly
              />
            ))}
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Site-wide drawings are managed under Site Admin → Drawings.
          </p>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload drawing to this plot</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>File</Label>
              <Input type="file" ref={fileRef} accept=".pdf,image/*,.dwg" />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Uses filename if blank" />
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

function DrawingRow({ d, onDelete, onCopy, copied, readOnly }: { d: Drawing; onDelete: (d: Drawing) => void; onCopy: (url: string, id: string) => void; copied: boolean; readOnly?: boolean }) {
  const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
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
        {!readOnly && (
          <button onClick={() => onDelete(d)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

