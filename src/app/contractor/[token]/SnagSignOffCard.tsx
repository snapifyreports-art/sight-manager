"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Camera, Loader2 } from "lucide-react";

interface Snag {
  id: string;
  description: string;
  status: string;
  priority: string;
  location: string | null;
  notes?: string | null;
  plot: { plotNumber: string | null; name: string };
  photos?: Array<{ id: string; url: string; tag: string | null }>;
}

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

export function SnagSignOffCard({ snag, token }: { snag: Snag; token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(snag.status === "IN_PROGRESS");
  const [error, setError] = useState<string | null>(null);

  const hasDetail = (snag.photos && snag.photos.length > 0) || snag.notes;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Token-auth endpoint — photos + notes + status flip in one call.
      const fd = new FormData();
      fd.append("snagId", snag.id);
      if (notes.trim()) fd.append("notes", notes.trim());
      photos.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/contractor-share/${token}/snag-action`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Failed to submit");
        return;
      }
      setRequested(true);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => hasDetail && setExpanded(!expanded)}>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{snag.description}</p>
          <p className="text-sm text-muted-foreground">
            {plotLabel(snag.plot)}{snag.location ? ` · ${snag.location}` : ""}
            {snag.photos && snag.photos.length > 0 && <span className="ml-1"> · {snag.photos.length} photo{snag.photos.length !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLOR[snag.priority] ?? "bg-slate-100 text-slate-600"}`}>
            {PRIORITY_LABEL[snag.priority] ?? snag.priority}
          </span>
          {requested ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Requested</span>
          ) : (
            <button
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
              onClick={() => setShowForm(!showForm)}
            >
              <CheckCircle2 className="mr-1 inline size-3" />
              Request Sign Off
            </button>
          )}
        </div>
      </div>
      {/* Expandable detail with photos and notes */}
      {expanded && hasDetail && (
        <div className="mt-2 space-y-2 border-t border-orange-200 pt-2">
          {snag.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Notes</p>
              <p className="text-sm">{snag.notes}</p>
            </div>
          )}
          {snag.photos && snag.photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Photos ({snag.photos.length})</p>
              <div className="flex flex-wrap gap-2">
                {snag.photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                    <img src={p.url} alt="" className="size-20 rounded border object-cover" />
                    {p.tag && <span className="mt-0.5 block text-center text-[9px] text-muted-foreground">{p.tag}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {showForm && !requested && (
        <div className="mt-3 space-y-2 border-t border-orange-200 pt-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {error}
            </p>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about the fix (optional)..."
            rows={2}
            className="w-full rounded border bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50">
              <Camera className="size-3.5" />
              {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Add Photos"}
              <input type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => setPhotos(Array.from(e.target.files || []))} />
            </label>
            <div className="flex-1" />
            <button
              className="rounded border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
              onClick={() => setShowForm(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
