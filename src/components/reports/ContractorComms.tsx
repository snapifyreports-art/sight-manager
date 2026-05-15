"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { format, parseISO, addDays, startOfWeek, isWithinInterval } from "date-fns";
import {
  Loader2,
  HardHat,
  Briefcase,
  ChevronRight,
  AlertTriangle,
  Phone,
  Mail,
  CheckCircle2,
  PlayCircle,
  Clock,
  Link2,
  Copy,
  Check,
  Printer,
  X,
  Building2,
  Send,
  Package,
  Camera,
  FileText,
  Download,
  ExternalLink,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchErrorMessage, useToast } from "@/components/ui/toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useConfirm } from "@/hooks/useConfirm";
import { MiniGantt } from "@/components/shared/MiniGantt";

interface Job {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
  signOffRequested?: boolean;
}

interface Snag {
  id: string;
  description: string;
  status: string;
  priority: string;
  location: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
}

interface ContractorOrder {
  id: string;
  status: string;
  itemsDescription: string | null;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  supplier: { id: string; name: string };
  items: Array<{ name: string; quantity: number; unit: string }>;
}

interface ContractorDrawing {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  plot: { id: string; plotNumber: string | null; name: string } | null;
}

interface Contractor {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  activePlotCount: number;
  liveJobs: Job[];
  nextJobs: Job[];
  // (May 2026 Keith bug report) Every job the contractor is on, across
  // all plots — the Mini Programme renders this so it shows all plots,
  // not just live + the first 3 upcoming.
  allJobs: Job[];
  openSnags: Snag[];
  orders?: ContractorOrder[];
  drawings?: ContractorDrawing[];
  // (May 2026 Keith request) Toolbox talks this contractor was linked
  // to — logged against them when the manager linked them on the talk.
  toolboxTalks?: Array<{ id: string; topic: string; deliveredAt: string }>;
}

interface CommsData {
  site: { id: string; name: string };
  contractors: Contractor[];
}

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(parseISO(d), "dd MMM");
}

// ── Mini-Gantt for contractor's jobs ────────────────────────────────────
//
// Keith's Apr 2026 idea: "their own little mini ghannt of their jobs with
// the rows being plots". Grouped by plot, each job a coloured bar
// positioned across a 12-week window from today. Live jobs are green,
// upcoming blue. "Today" column highlighted. One quick glance tells a
// contractor/manager "what do I have across the whole site this quarter".
//
// MiniGantt extracted to src/components/shared/MiniGantt.tsx so the
// contractor-facing share page uses the same visual — Apr 2026 audit
// Keith: "the shareable links don't feature all the info".
// Removed local copy below (body kept stubbed for clean refactor).

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

function ShareDialog({
  siteId,
  contractor,
  onClose,
  onLinkGenerated,
}: {
  siteId: string;
  contractor: Contractor;
  onClose: () => void;
  onLinkGenerated?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const { copy: copyUrlToClipboard, copied } = useCopyToClipboard();

  // Keep the latest onLinkGenerated in a ref so the effect doesn't re-fire if
  // the parent re-creates the callback on every render (which would cause us
  // to generate a new share link each time).
  const onLinkGeneratedRef = useRef(onLinkGenerated);
  useEffect(() => {
    onLinkGeneratedRef.current = onLinkGenerated;
  }, [onLinkGenerated]);

  // Auto-generate permanent link on open
  useEffect(() => {
    // (May 2026 pattern sweep) Guard with .ok + cancellation flag —
    // rapidly opening/closing dialogs for different contractors (or
    // React StrictMode re-mounts) let a slower request overwrite the
    // URL/email body for the wrong contractor.
    let cancelled = false;
    fetch(`/api/sites/${siteId}/contractor-comms/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contractor.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.url || cancelled) return;
        setUrl(data.url);
        onLinkGeneratedRef.current?.();
        const name = contractor.company || contractor.name;
        setEmailBody(
          `Hi ${contractor.name},\n\nHere is your permanent link to view your live jobs, upcoming work, orders and any open snags for ${name}:\n\n${data.url}\n\nThis link stays up to date automatically — no need to request a new one. Please do not hesitate to get in touch if you have any queries.\n\nKind regards`
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, contractor.id, contractor.name, contractor.company]);

  const copy = async () => {
    if (!url) return;
    await copyUrlToClipboard(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Share with {contractor.name}</h3>
            {contractor.company && (
              <p className="text-xs text-muted-foreground">{contractor.company}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Permanent read-only link showing live jobs, upcoming work, orders and open snags. Always up to date — no login required.
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
                <span className="flex-1 truncate text-xs text-muted-foreground">{url}</span>
                <button
                  onClick={copy}
                  className="shrink-0 rounded p-1 hover:bg-slate-200"
                  title="Copy link"
                >
                  {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {copied ? "Copied!" : "Click the icon to copy. Send this link directly to your contractor."}
              </p>
              {/* Email compose */}
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Email body (editable before sending)</p>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <a
                  href={`mailto:${contractor.email || ""}?subject=${encodeURIComponent(`Your worksheets — ${contractor.company || contractor.name}`)}&body=${encodeURIComponent(emailBody)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Send className="size-3.5" />
                  Open in Email App
                </a>
                {!contractor.email && (
                  <p className="text-[11px] text-amber-600">No email on file — add one in Contacts first.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SnagCard({ snag, siteId }: { snag: Snag; siteId: string }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(snag.status === "IN_PROGRESS");

  // (May 2026 pattern sweep) Sync requested toggle to prop changes —
  // if another tab marks the snag requested, the local toggle would
  // otherwise stay stale.
  useEffect(() => {
    setRequested(snag.status === "IN_PROGRESS");
  }, [snag.status]);
  const [snagPhotos, setSnagPhotos] = useState<Array<{ id: string; url: string; tag: string | null }>>([]);
  const [snagNotes, setSnagNotes] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (snagPhotos.length === 0 && !loadingDetail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/snags/${snag.id}`);
        if (res.ok) {
          const data = await res.json();
          setSnagPhotos(data.photos ?? []);
          setSnagNotes(data.notes ?? null);
        }
      } catch { /* non-critical */ }
      finally { setLoadingDetail(false); }
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Photo upload first — if this fails, abort so we don't request
      // sign-off without the evidence the contractor is expected to review.
      if (photos.length > 0) {
        const fd = new FormData();
        photos.forEach((f) => fd.append("photos", f));
        fd.append("tag", "after");
        const photoRes = await fetch(`/api/snags/${snag.id}/photos`, { method: "POST", body: fd });
        if (!photoRes.ok) {
          toast.error(await fetchErrorMessage(photoRes, "Photo upload failed — sign-off NOT requested"));
          return;
        }
      }
      const res = await fetch(`/api/snags/${snag.id}/request-signoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to request sign-off"));
        return;
      }
      toast.success("Sign-off requested");
      setRequested(true);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error requesting sign-off");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg bg-orange-50 px-3 py-2">
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={handleExpand}>
        <div className="min-w-0 flex-1">
          <p className="text-sm">{snag.description}</p>
          <p className="text-xs text-muted-foreground">
            <Link href={`/sites/${siteId}/plots/${snag.plot.id}`} className="text-blue-600 hover:underline">{plotLabel(snag.plot)}</Link>{snag.location ? ` · ${snag.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_COLORS[snag.priority] ?? "bg-slate-100 text-slate-600")}>
            {snag.priority}
          </span>
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-orange-200 pt-2">
          {loadingDetail && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {snagNotes && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">Notes</p>
              <p className="text-xs">{snagNotes}</p>
            </div>
          )}
          {snagPhotos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Photos ({snagPhotos.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {/* (May 2026 a11y audit #119 + #129) Use the photo's
                    tag (or "Snag photo N") as alt text; external link
                    gets sr-only "(opens in new tab)". */}
                {snagPhotos.map((p, i) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    aria-label={`Open photo${p.tag ? ` (${p.tag})` : ` ${i + 1}`} in new tab`}
                  >
                    <img
                      src={p.url}
                      alt={p.tag ? `Snag photo: ${p.tag}` : `Snag photo ${i + 1}`}
                      className="size-16 rounded border object-cover"
                    />
                    {p.tag && <span className="mt-0.5 block text-center text-[9px] text-muted-foreground">{p.tag}</span>}
                    <span className="sr-only">(opens in new tab)</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {!loadingDetail && snagPhotos.length === 0 && !snagNotes && (
            <p className="text-xs text-muted-foreground">No photos or notes yet</p>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-end">
        {requested ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Sign Off Requested</span>
        ) : (
          <Button variant="outline" size="sm" className="h-6 gap-1 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50"
            onClick={() => setShowForm(!showForm)}>
            <CheckCircle2 className="size-2.5" /> Request Sign Off
          </Button>
        )}
      </div>
      {showForm && !requested && (
        <div className="mt-2 space-y-2 border-t border-orange-200 pt-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about the fix (optional)..."
            rows={2}
            className="w-full rounded border bg-white px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1 rounded border bg-white px-2 py-1 text-[10px] text-muted-foreground hover:bg-slate-50">
              <Camera className="size-3" />
              {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Add Photos"}
              <input type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => setPhotos(Array.from(e.target.files || []))} />
            </label>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowForm(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 gap-1 bg-amber-600 px-2 text-[10px] text-white hover:bg-amber-700" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="size-2.5 animate-spin" /> : <CheckCircle2 className="size-2.5" />}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function useLastShareSent(siteId: string, contactId: string) {
  const key = `share-sent:${siteId}:${contactId}`;
  const logKey = `share-log:${siteId}:${contactId}`;
  // Lazy initializers read from localStorage on mount — avoids an effect
  // + setState cascade (which React's compiler now lints against, even
  // though syncing from an external store is the legit use case for that
  // pattern). We still guard for SSR where window is undefined.
  const [lastSent, setLastSent] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(key); } catch { return null; }
  });
  const [log, setLog] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(logKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const markSent = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(key, now);
      // Append to rolling log; keep last 20 entries so the messages log
      // has history without growing unbounded.
      const raw = localStorage.getItem(logKey);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const next = [now, ...existing].slice(0, 20);
      localStorage.setItem(logKey, JSON.stringify(next));
      setLog(next);
    } catch { /* ignore */ }
    setLastSent(now);
  }, [key, logKey]);

  return { lastSent, log, markSent };
}

function formatRelativeDate(iso: string): string {
  const sent = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - sent.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return format(sent, "dd MMM");
}

interface ContactDoc {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

function ContractorCard({
  contractor,
  siteId,
}: {
  contractor: Contractor;
  siteId: string;
}) {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [shareOpen, setShareOpen] = useState(false);
  const { lastSent, log: shareLog, markSent } = useLastShareSent(siteId, contractor.id);
  const [requestingSignOff, setRequestingSignOff] = useState<Set<string>>(new Set());
  const [requestedSignOff, setRequestedSignOff] = useState<Set<string>>(
    new Set(contractor.liveJobs.filter((j) => j.signOffRequested).map((j) => j.id))
  );

  // (May 2026 Keith request) "View" — open the contractor's own comms
  // page (the same /contractor/[token] page they get via Send Link) in
  // a new tab, so the manager can see exactly what the contractor sees
  // without having to send themselves the link first. The share route
  // is idempotent — it returns the contractor's permanent token.
  const [viewLoading, setViewLoading] = useState(false);
  const handleView = useCallback(async () => {
    // (May 2026 Keith bug report) Open the tab SYNCHRONOUSLY on click
    // so the browser's popup-blocker sees it as user-gesture-driven.
    // The previous version called `window.open` AFTER `await fetch`,
    // which Chrome/Safari/etc. silently dropped because the gesture
    // chain was already broken. We open a blank tab here and point
    // it at the token URL once the share API responds. `noopener` is
    // intentionally omitted — keeping the handle is what lets us set
    // `.location.href` after the async work; the destination is our
    // own /contractor/[token] page so the security trade-off is fine.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error(
        "Popup blocked — allow popups for this site, then click View again.",
      );
      return;
    }
    setViewLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/contractor-comms/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contractor.id }),
      });
      if (!res.ok) {
        popup.close();
        toast.error(
          await fetchErrorMessage(res, "Couldn't open the contractor view"),
        );
        return;
      }
      const data = await res.json();
      if (data?.url) {
        popup.location.href = data.url;
      } else {
        popup.close();
        toast.error("Couldn't open the contractor view");
      }
    } catch (e) {
      popup.close();
      toast.error(
        e instanceof Error ? e.message : "Couldn't open the contractor view",
      );
    } finally {
      setViewLoading(false);
    }
  }, [siteId, contractor.id, toast]);

  // RAMS / method-statement documents — lazy-loaded per-contractor.
  // Keith Apr 2026 Q3: reuse Document model with contactId scope.
  const [ramsDocs, setRamsDocs] = useState<ContactDoc[] | null>(null);
  const [ramsLoading, setRamsLoading] = useState(false);
  const [ramsUploading, setRamsUploading] = useState(false);
  const ramsInputRef = useRef<HTMLInputElement>(null);

  const loadRams = useCallback(async () => {
    setRamsLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contractor.id}/documents`);
      if (res.ok) setRamsDocs(await res.json());
    } finally {
      setRamsLoading(false);
    }
  }, [contractor.id]);

  const handleRamsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRamsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      fd.append("category", "RAMS");
      const res = await fetch(`/api/contacts/${contractor.id}/documents`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const doc = await res.json();
        setRamsDocs((prev) => (prev ? [doc, ...prev] : [doc]));
        toast.success(`"${file.name}" uploaded`);
      } else {
        toast.error(await fetchErrorMessage(res, "Upload failed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error uploading document");
    } finally {
      setRamsUploading(false);
      if (ramsInputRef.current) ramsInputRef.current.value = "";
    }
  };

  const handleRamsDelete = async (docId: string) => {
    const ok = await confirm({
      title: "Delete this document?",
      body: "This cannot be undone.",
      confirmLabel: "Delete document",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setRamsDocs((prev) => (prev ? prev.filter((d) => d.id !== docId) : prev));
        toast.success("Document deleted");
      } else {
        // Don't optimistically remove — the server rejected, so leave the UI alone
        toast.error(await fetchErrorMessage(res, "Failed to delete document"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error deleting document");
    }
  };

  const handleRequestSignOff = async (jobId: string) => {
    setRequestingSignOff((prev) => new Set(prev).add(jobId));
    try {
      // (May 2026 pattern sweep) Pre-fix this fetch swallowed failures.
      // The UI flipped to "Sign Off Requested" badge even on 500 / 403,
      // and the contractor never received the notification — the badge
      // lied.
      const res = await fetch(`/api/jobs/${jobId}/request-signoff`, { method: "POST" });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to request sign-off"));
        return;
      }
      setRequestedSignOff((prev) => new Set(prev).add(jobId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error requesting sign-off");
    } finally {
      setRequestingSignOff((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm print:break-inside-avoid print:shadow-none">
      {confirmDialog}
      {/* Header */}
      <div className="border-b px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <HardHat className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{contractor.name}</h3>
                {contractor.company && (
                  <p className="text-sm text-muted-foreground truncate">{contractor.company}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                <span>{contractor.activePlotCount} plot{contractor.activePlotCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {contractor.phone && (
                <a href={`tel:${contractor.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Phone className="size-3" /> {contractor.phone}
                </a>
              )}
              {contractor.email && (
                <a href={`mailto:${contractor.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate">
                  <Mail className="size-3 shrink-0" /> <span className="truncate">{contractor.email}</span>
                </a>
              )}
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShareOpen(true)}>
                  <Link2 className="mr-1 size-3" />
                  Send Link
                </Button>
                {/* (May 2026 Keith request) View the contractor's comms
                    page yourself — no need to send a link first. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleView}
                  disabled={viewLoading}
                >
                  {viewLoading ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-1 size-3" />
                  )}
                  View
                </Button>
                {lastSent && (
                  <span className="text-[10px] text-muted-foreground">
                    Sent {formatRelativeDate(lastSent)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {/* Mini Programme — rows=plots, cols=weeks. Keith's Apr 2026 idea.
            Collapsed by default (Apr 2026 follow-up: Keith "mini programmes
            can be collapsed on page open"). Click the section header to
            expand. */}
        {contractor.allJobs.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <Briefcase className="size-4 text-blue-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                Mini Programme
              </span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-4 pb-3 sm:px-5">
              {/* (May 2026 Keith bug report) Feed the FULL job list so the
                  Mini Programme shows every plot the contractor is on —
                  not just live + the first 3 upcoming. */}
              <MiniGantt
                siteId={siteId}
                jobs={contractor.allJobs.map((j) => ({
                  id: j.id,
                  name: j.name,
                  status: j.status,
                  startDate: j.startDate,
                  endDate: j.endDate,
                  plot: j.plot,
                  live: j.status === "IN_PROGRESS",
                }))}
              />
            </div>
          </details>
        )}

        {/* Day Sheets — this week, Mon-Sun, jobs active on each day.
            Keith Apr 2026 Q1=c: inline view + printable. Print button uses
            the browser's print dialog which emits PDF on "Save as PDF".
            The existing print:* CSS classes (break-inside-avoid on the
            card, print:hidden on the share button) scope what prints. */}
        {(contractor.liveJobs.length > 0 || contractor.nextJobs.length > 0) && (() => {
          // Build the Mon-Sun range starting this week.
          const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
          const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
          const allJobs = [...contractor.liveJobs, ...contractor.nextJobs];
          const jobsForDay = (day: Date) => {
            return allJobs.filter((j) => {
              if (!j.startDate || !j.endDate) return false;
              const start = parseISO(j.startDate);
              const end = parseISO(j.endDate);
              return isWithinInterval(day, { start, end });
            });
          };
          const hasAnything = days.some((d) => jobsForDay(d).length > 0);
          if (!hasAnything) return null;
          return (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                <CalendarDays className="size-4 text-indigo-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                  Day Sheets (this week)
                </span>
                <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-4 pb-3 sm:px-5">
                <div className="mb-2 flex justify-end print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => window.print()}
                  >
                    <Printer className="size-3" />
                    Print / PDF
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {days.map((day) => {
                    const jobs = jobsForDay(day);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          isWeekend ? "bg-slate-50 border-slate-100" : "bg-white border-border"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">
                            {format(day, "EEE d MMM")}
                            {isWeekend && (
                              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(weekend)</span>
                            )}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {jobs.length === 0 ? "No work" : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        {jobs.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {jobs.map((j) => (
                              <li key={j.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="inline-block size-1.5 shrink-0 rounded-full bg-green-500" />
                                <Link
                                  href={`/jobs/${j.id}`}
                                  className="truncate hover:text-blue-600 hover:underline"
                                >
                                  {j.name}
                                </Link>
                                <span className="text-slate-400">·</span>
                                <span className="shrink-0">{plotLabel(j.plot)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })()}

        {/* Live Jobs */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <PlayCircle className="size-4 text-green-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Live Jobs ({contractor.liveJobs.length})
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 pb-3 sm:px-5">
            {contractor.liveJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active jobs</p>
            ) : (
              <div className="space-y-1.5">
                {contractor.liveJobs.map((job) => (
                  <div key={job.id} className="rounded-lg bg-green-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          <Link href={`/jobs/${job.id}`} className="text-blue-600 hover:underline">{job.name}</Link>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Link href={`/sites/${siteId}/plots/${job.plot.id}`} className="text-blue-600 hover:underline">{plotLabel(job.plot)}</Link>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">Due {fmtDate(job.endDate)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-end">
                      {requestedSignOff.has(job.id) ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Sign Off Requested</span>
                      ) : (
                        <Button variant="outline" size="sm" className="h-6 gap-1 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50"
                          disabled={requestingSignOff.has(job.id)}
                          onClick={() => handleRequestSignOff(job.id)}>
                          {requestingSignOff.has(job.id) ? <Loader2 className="size-2.5 animate-spin" /> : <CheckCircle2 className="size-2.5" />}
                          Request Sign Off
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Next Jobs */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <Clock className="size-4 text-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Coming Up ({contractor.nextJobs.length})
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 pb-3 sm:px-5">
            {contractor.nextJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No upcoming jobs</p>
            ) : (
              <div className="space-y-1.5">
                {contractor.nextJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        <Link href={`/jobs/${job.id}`} className="text-blue-600 hover:underline">{job.name}</Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/sites/${siteId}/plots/${job.plot.id}`} className="text-blue-600 hover:underline">{plotLabel(job.plot)}</Link>
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Starts {fmtDate(job.startDate)}</p>
                      <p>Due {fmtDate(job.endDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Open Snags — filtered to this contractor (Keith Apr 2026:
            "snags-assigned tab"). Already per-contractor via openSnags. */}
        {contractor.openSnags.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <AlertTriangle className="size-4 text-orange-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                Snags Assigned ({contractor.openSnags.length})
              </span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-4 pb-3 sm:px-5 space-y-1.5">
              {contractor.openSnags.map((snag) => (
                <SnagCard key={snag.id} snag={snag} siteId={siteId} />
              ))}
            </div>
          </details>
        )}

        {/* RAMS / Method Statements — contractor-scoped documents.
            Lazy-loaded on first expand. Keith Apr 2026 Q3: any file type,
            any size, visible on contractor share link. Uploaded files are
            stored as SiteDocument rows with contactId set + siteId null. */}
        <details
          className="group"
          onToggle={(e) => {
            if (e.currentTarget.open && ramsDocs === null) loadRams();
          }}
        >
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <FileText className="size-4 text-purple-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              RAMS / Method Statements{ramsDocs !== null ? ` (${ramsDocs.length})` : ""}
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 pb-3 sm:px-5">
            <div className="mb-2 flex items-center justify-between print:hidden">
              <p className="text-[11px] text-muted-foreground">
                Uploads here are visible to {contractor.name} on their share link.
              </p>
              <input
                ref={ramsInputRef}
                type="file"
                onChange={handleRamsUpload}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                disabled={ramsUploading}
                onClick={() => ramsInputRef.current?.click()}
              >
                {ramsUploading ? <Loader2 className="size-3 animate-spin" /> : <Copy className="size-3" />}
                {ramsUploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
            {ramsLoading && ramsDocs === null ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : ramsDocs === null || ramsDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No RAMS or method statements uploaded yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {ramsDocs.map((d) => {
                  const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-purple-50/50 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-purple-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            Uploaded {formatRelativeDate(d.createdAt)}
                            {sizeKb !== null ? ` · ${sizeKb} KB` : ""}
                            {d.uploadedBy ? ` · by ${d.uploadedBy.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 print:hidden">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                          title="Open"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                        <a
                          href={d.url}
                          download={d.fileName}
                          className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                          title="Download"
                        >
                          <Download className="size-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRamsDelete(d.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </details>

        {/* Messages Log — history of contractor-facing comms events.
            Keith Apr 2026 Q2=b: reuse existing logging rather than a new
            ContractorMessage model. Currently captures: Send Link (share
            URL emailed). Future: sign-off requests, day-sheet sends.
            Storage: localStorage rolling-20 per contractor. Lightweight
            but real — no data loss on reload. */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <MessageSquare className="size-4 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Messages Log ({shareLog.length})
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 pb-3 sm:px-5">
            {shareLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No messages sent to {contractor.name} yet. When you tap <strong>Send Link</strong> above, it&apos;ll log here.
              </p>
            ) : (
              <ul className="space-y-1">
                {shareLog.map((iso) => (
                  <li
                    key={iso}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <Link2 className="size-3 text-slate-500" />
                      Share link sent
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeDate(iso)} · {format(parseISO(iso), "d MMM yy HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        {/* (May 2026 Keith request) Toolbox Talks — talks this
            contractor was linked to on the site's toolbox-talk log. */}
        {contractor.toolboxTalks && contractor.toolboxTalks.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <HardHat className="size-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Toolbox Talks ({contractor.toolboxTalks.length})
              </span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="space-y-1 px-4 pb-3 sm:px-5">
              {contractor.toolboxTalks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-amber-50/60 px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-medium text-slate-700">
                    {t.topic}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {format(parseISO(t.deliveredAt), "d MMM yy")}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Drawings */}
        {contractor.drawings && contractor.drawings.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <FileText className="size-4 text-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                Drawings ({contractor.drawings.length})
              </span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-4 pb-3 sm:px-5 space-y-1.5">
              {contractor.drawings.map((d) => {
                const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-blue-50/50 px-3 py-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {d.plot ? (d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name) : "Site-wide"}
                          {sizeKb !== null ? ` · ${sizeKb} KB` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Open"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                      <a
                        href={d.url}
                        download={d.fileName}
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Download"
                      >
                        <Download className="size-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* Material Orders & Deliveries — split into 3 categories */}
        {(() => {
          const allOrders = contractor.orders ?? [];
          if (allOrders.length === 0) return null;
          const now = new Date();
          const in14Days = new Date(now);
          in14Days.setDate(in14Days.getDate() + 14);

          // Materials on site (delivered)
          const onSite = allOrders.filter((o) => o.status === "DELIVERED");
          // Next 14 days (not delivered, order or delivery date within 14 days)
          const upcoming = allOrders.filter((o) => {
            if (o.status === "DELIVERED") return false;
            const relevantDate = o.expectedDeliveryDate || o.dateOfOrder;
            if (!relevantDate) return false;
            return new Date(relevantDate) <= in14Days;
          });
          // Future (over 14 days away, not delivered)
          const future = allOrders.filter((o) => {
            if (o.status === "DELIVERED") return false;
            const relevantDate = o.expectedDeliveryDate || o.dateOfOrder;
            if (!relevantDate) return true;
            return new Date(relevantDate) > in14Days;
          });

          const renderOrder = (order: ContractorOrder) => {
            const isSent = order.status === "ORDERED";
            const statusColor = order.status === "DELIVERED"
              ? "bg-green-100 text-green-700"
              : isSent ? "bg-blue-100 text-blue-700"
              : "bg-amber-100 text-amber-700";
            // Fix terminology: "Order due" for unsent, "Ordered" for sent
            const dateLabel = isSent
              ? `Ordered ${fmtDate(order.dateOfOrder)}${order.expectedDeliveryDate ? ` · Delivery due ${fmtDate(order.expectedDeliveryDate)}` : ""}`
              : order.status === "DELIVERED"
              ? `Delivered ${fmtDate(order.deliveredDate)}${order.dateOfOrder ? ` · Ordered ${fmtDate(order.dateOfOrder)}` : ""}`
              : `Order due ${fmtDate(order.dateOfOrder)}${order.expectedDeliveryDate ? ` · Delivery due ${fmtDate(order.expectedDeliveryDate)}` : ""}`;

            return (
              <div key={order.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <Link href={`/suppliers/${order.supplier.id}`} className="text-blue-600 hover:underline">{order.supplier.name}</Link>
                    </p>
                    {order.items.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} — {item.name}
                          </li>
                        ))}
                      </ul>
                    ) : order.itemsDescription ? (
                      <p className="text-xs text-muted-foreground">{order.itemsDescription}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{dateLabel}</p>
                  </div>
                  <span className={cn("ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", statusColor)}>
                    {isSent ? "Sent" : order.status === "DELIVERED" ? "On Site" : "Not Ordered"}
                  </span>
                </div>
              </div>
            );
          };

          return (
            <>
              {upcoming.length > 0 && (
                <details className="group border-t">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <Package className="size-4 text-blue-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                      Orders & Deliveries — Next 14 Days ({upcoming.length})
                    </span>
                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-3 sm:px-5 space-y-1.5">{upcoming.map(renderOrder)}</div>
                </details>
              )}
              {onSite.length > 0 && (
                <details className="group border-t">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <CheckCircle2 className="size-4 text-green-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
                      Materials on Site ({onSite.length})
                    </span>
                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-3 sm:px-5 space-y-1.5">{onSite.map(renderOrder)}</div>
                </details>
              )}
              {future.length > 0 && (
                <details className="group border-t">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <Clock className="size-4 text-slate-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Future Orders & Deliveries ({future.length})
                    </span>
                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-3 sm:px-5 space-y-1.5">{future.map(renderOrder)}</div>
                </details>
              )}
            </>
          );
        })()}
      </div>

      {shareOpen && (
        <ShareDialog
          siteId={siteId}
          contractor={contractor}
          onClose={() => setShareOpen(false)}
          onLinkGenerated={markSent}
        />
      )}
    </div>
  );
}

export function ContractorComms({ siteId }: { siteId: string }) {
  const [loaded, setLoaded] = useState<{ siteId: string; data: CommsData | null; error: string | null } | null>(null);
  const data = loaded?.siteId === siteId ? loaded.data : null;
  const loading = loaded?.siteId !== siteId;
  const error = loaded?.siteId === siteId ? loaded.error : null;
  const [filter, setFilter] = useState<string | null>(null); // contactId or null = all

  // Tick used to force a refetch from useRefreshOnFocus (incremented on focus)
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/contractor-comms`);
        if (cancelled) return;
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to load contractor comms");
          setLoaded({ siteId, data: null, error: msg });
          return;
        }
        const json = await res.json();
        if (!cancelled) setLoaded({ siteId, data: json, error: null });
      } catch (e) {
        if (!cancelled) setLoaded({ siteId, data: null, error: e instanceof Error ? e.message : "Network error" });
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, refreshTick]);

  const bumpTick = useCallback(() => setRefreshTick((n) => n + 1), []);
  useRefreshOnFocus(bumpTick);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Failed to load contractor comms</p>
        <p className="text-xs">{error}</p>
        <button onClick={() => setLoaded(null)} className="mt-2 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data || data.contractors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HardHat className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No contractors assigned</p>
        <p className="text-xs text-muted-foreground">Assign contractors to jobs to see them here.</p>
      </div>
    );
  }

  const visible = filter ? data.contractors.filter((c) => c.id === filter) : data.contractors;
  const liveCount = data.contractors.filter((c) => c.liveJobs.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !filter
                ? "bg-blue-600 text-white"
                : "border border-border/60 text-muted-foreground hover:border-blue-300 hover:text-blue-700"
            )}
          >
            All ({data.contractors.length})
          </button>
          {data.contractors.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id === filter ? null : c.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === c.id
                  ? "bg-blue-600 text-white"
                  : "border border-border/60 text-muted-foreground hover:border-blue-300 hover:text-blue-700"
              )}
            >
              {c.name}
              {c.liveJobs.length > 0 && (
                <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                  {c.liveJobs.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{liveCount} active</span>
          <span>·</span>
          <span>{data.contractors.length} total</span>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 size-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {visible.map((contractor) => (
          <ContractorCard key={contractor.id} contractor={contractor} siteId={siteId} />
        ))}
      </div>
    </div>
  );
}
