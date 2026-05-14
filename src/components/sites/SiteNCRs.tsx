"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * (May 2026 audit #178) Non-Conformance Reports per site.
 *
 * Heavier than snags — root cause + corrective action + five-state
 * lifecycle. Use for situations that need formal QA tracking, not
 * everyday defect-fixes.
 */

type Status = "OPEN" | "INVESTIGATING" | "AWAITING_CORRECTION" | "RESOLVED" | "CLOSED";

interface NCR {
  id: string;
  ref: string | null;
  title: string;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  status: Status;
  raisedAt: string;
  plot: { id: string; name: string; plotNumber: string | null } | null;
  job: { id: string; name: string } | null;
  contact: { id: string; name: string; company: string | null } | null;
}

const STATUS_CLASS: Record<Status, string> = {
  OPEN: "bg-red-100 text-red-800",
  INVESTIGATING: "bg-amber-100 text-amber-800",
  AWAITING_CORRECTION: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-100 text-slate-600",
};

export function SiteNCRs({ siteId }: { siteId: string }) {
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/ncrs`);
      if (res.ok) setNcrs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/ncrs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setNcrs(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/ncrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          rootCause: rootCause || null,
          correctiveAction: correctiveAction || null,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to raise NCR"));
        return;
      }
      setOpen(false);
      setTitle("");
      setDescription("");
      setRootCause("");
      setCorrectiveAction("");
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(ncr: NCR, status: Status) {
    const res = await fetch(`/api/sites/${siteId}/ncrs/${ncr.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) void refresh();
    else toast.error(await fetchErrorMessage(res, "Failed to update"));
  }

  const openCount = ncrs.filter((n) => n.status !== "CLOSED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileWarning className="size-4 text-muted-foreground" aria-hidden="true" />
          Non-Conformance Reports
          <span className="text-sm font-normal text-muted-foreground">
            ({openCount} open / {ncrs.length} total)
          </span>
        </h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Raise NCR
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : ncrs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          No NCRs raised. Use this for situations that need formal QA tracking
          (root cause + corrective action). Day-to-day defects belong in the
          Snags tab — NCRs are heavier and rarer.
        </div>
      ) : (
        <div className="space-y-2">
          {ncrs.map((n) => {
            const isOpen = expanded === n.id;
            return (
              <div key={n.id} className="rounded-lg border bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : n.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                    {n.ref || n.id.slice(-6)}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">
                    {n.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASS[n.status]}`}
                  >
                    {n.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(n.raisedAt), "dd MMM")}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t bg-slate-50/50 p-3 text-sm">
                    <Field label="Description" value={n.description} />
                    {n.rootCause && <Field label="Root cause" value={n.rootCause} />}
                    {n.correctiveAction && (
                      <Field label="Corrective action" value={n.correctiveAction} />
                    )}
                    <div className="flex flex-wrap gap-3 text-xs">
                      {n.plot && (
                        <span>
                          Plot: {n.plot.plotNumber ? `#${n.plot.plotNumber}` : n.plot.name}
                        </span>
                      )}
                      {n.job && <span>Job: {n.job.name}</span>}
                      {n.contact && (
                        <span>
                          Contractor: {n.contact.company || n.contact.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs" htmlFor={`status-${n.id}`}>
                        Status
                      </Label>
                      <select
                        id={`status-${n.id}`}
                        value={n.status}
                        onChange={(e) => updateStatus(n, e.target.value as Status)}
                        className="rounded-md border bg-white px-2 py-1 text-xs"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="INVESTIGATING">INVESTIGATING</option>
                        <option value="AWAITING_CORRECTION">
                          AWAITING CORRECTION
                        </option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise NCR</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ncr-title">Title *</Label>
              <Input
                id="ncr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Brickwork bond pattern out of spec on Plot 12 gable"
              />
            </div>
            <div>
              <Label htmlFor="ncr-desc">Description *</Label>
              <Textarea
                id="ncr-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's wrong, where, what extent…"
              />
            </div>
            <div>
              <Label htmlFor="ncr-rc">Root cause (optional)</Label>
              <Textarea
                id="ncr-rc"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="ncr-ca">Corrective action (optional)</Label>
              <Textarea
                id="ncr-ca"
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={submit}
              disabled={submitting || !title.trim() || !description.trim()}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Raising…" : "Raise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{value}</p>
    </div>
  );
}
