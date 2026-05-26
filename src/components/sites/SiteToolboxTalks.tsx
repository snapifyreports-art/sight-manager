"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Plus,
  HardHat,
  Loader2,
  Paperclip,
  FileText,
  X,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
} from "lucide-react";
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
 * (May 2026 audit #176, #175, Keith request) Toolbox talk panel.
 *
 * Two modes:
 *   - "Log talk"     — record a talk that already happened.
 *   - "Request talk" — raise a pending talk, assign contractors, send
 *     them an email with attached briefing docs. Later marked complete.
 *
 * REQUESTED talks pin to the top so they don't get forgotten. Every
 * talk can carry multiple attachments (signed register + slide deck +
 * RAMS reference + an incident photo, etc).
 */

interface Attachment {
  id: string;
  url: string;
  fileName: string;
  size: number | null;
  mimeType: string | null;
}

interface Talk {
  id: string;
  topic: string;
  notes: string | null;
  attendees: string | null;
  contractorIds: string[];
  status: "REQUESTED" | "COMPLETED" | "CANCELLED";
  requestedAt: string;
  dueBy: string | null;
  emailSentAt: string | null;
  emailSentToCount: number | null;
  deliveredAt: string | null;
  // Legacy single-attachment fields — used as a fallback for old rows
  // written before the attachments[] table existed.
  documentUrl: string | null;
  documentFileName: string | null;
  documentSize: number | null;
  documentMimeType: string | null;
  attachments: Attachment[];
}

interface ContractorOption {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Some old rows have only the legacy `documentUrl` fields populated.
// New ones have `attachments[]`. Render a unified list either way.
function effectiveAttachments(t: Talk): Attachment[] {
  if (t.attachments && t.attachments.length > 0) return t.attachments;
  if (t.documentUrl) {
    return [
      {
        id: `legacy-${t.id}`,
        url: t.documentUrl,
        fileName: t.documentFileName || "Attachment",
        size: t.documentSize,
        mimeType: t.documentMimeType,
      },
    ];
  }
  return [];
}

type Mode = "log" | "request";

export function SiteToolboxTalks({ siteId }: { siteId: string }) {
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("log");
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [dueBy, setDueBy] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [selectedContractorIds, setSelectedContractorIds] = useState<string[]>([]);
  const toast = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/toolbox-talks`);
      if (res.ok) setTalks(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/toolbox-talks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setTalks(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch(`/api/contacts?type=CONTRACTOR`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d)) return;
        setContractors(
          d.map(
            (c: {
              id: string;
              name: string;
              company: string | null;
              email: string | null;
            }) => ({
              id: c.id,
              name: c.name,
              company: c.company,
              email: c.email,
            }),
          ),
        );
      })
      .catch(() => {
        /* non-critical — picker just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const contractorLabel = (cid: string): string => {
    const c = contractors.find((x) => x.id === cid);
    return c ? c.company || c.name : "Contractor";
  };

  function resetForm() {
    setTopic("");
    setNotes("");
    setAttendees("");
    setDeliveredAt("");
    setDueBy("");
    setSendEmail(true);
    setSelectedContractorIds([]);
    setDocFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openDialog(m: Mode) {
    setMode(m);
    resetForm();
    setOpen(true);
  }

  async function submit() {
    if (!topic.trim()) return;
    setSubmitting(true);
    try {
      // Use FormData unconditionally when there are files OR contractors
      // to keep the wiring uniform; falls back to JSON for the simplest
      // case so callers / scripts that POST JSON keep working.
      const useFormData = docFiles.length > 0;
      let res: Response;
      if (useFormData) {
        const fd = new FormData();
        fd.append("topic", topic.trim());
        fd.append("mode", mode);
        if (notes) fd.append("notes", notes);
        if (attendees) fd.append("attendees", attendees);
        if (mode === "log" && deliveredAt) fd.append("deliveredAt", deliveredAt);
        if (mode === "request" && dueBy) fd.append("dueBy", dueBy);
        if (mode === "request") fd.append("sendEmail", String(sendEmail));
        fd.append("contractorIds", JSON.stringify(selectedContractorIds));
        // Append every file under the same field name — the route reads
        // them via formData.getAll("document").
        for (const f of docFiles) fd.append("document", f);
        res = await fetch(`/api/sites/${siteId}/toolbox-talks`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/sites/${siteId}/toolbox-talks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            mode,
            notes: notes || null,
            attendees: attendees || null,
            contractorIds: selectedContractorIds,
            deliveredAt: mode === "log" ? deliveredAt || undefined : undefined,
            dueBy: mode === "request" ? dueBy || undefined : undefined,
            sendEmail: mode === "request" ? sendEmail : undefined,
          }),
        });
      }
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to save"));
        return;
      }
      const created = (await res.json()) as Talk;
      if (mode === "request") {
        toast.success(
          created.emailSentToCount && created.emailSentToCount > 0
            ? `Requested — emailed ${created.emailSentToCount} contractor${created.emailSentToCount !== 1 ? "s" : ""}`
            : "Toolbox talk requested",
        );
      } else {
        toast.success("Toolbox talk logged");
      }
      setOpen(false);
      resetForm();
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function markComplete(t: Talk) {
    setActioningId(t.id);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/toolbox-talks/${t.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete" }),
        },
      );
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to mark complete"));
        return;
      }
      toast.success("Talk marked complete");
      void refresh();
    } finally {
      setActioningId(null);
    }
  }

  async function cancelTalk(t: Talk) {
    setActioningId(t.id);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/toolbox-talks/${t.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        },
      );
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to cancel"));
        return;
      }
      toast.success("Talk cancelled");
      void refresh();
    } finally {
      setActioningId(null);
    }
  }

  // Split talks by status so REQUESTED ones pin to the top. Within
  // each group the API already sorts by requestedAt desc.
  const requested = talks.filter((t) => t.status === "REQUESTED");
  const historical = talks.filter((t) => t.status !== "REQUESTED");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HardHat className="size-4 text-muted-foreground" aria-hidden="true" />
          Toolbox talks
          <span className="text-sm font-normal text-muted-foreground">
            ({talks.length})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openDialog("request")}>
            <Send className="size-4" /> Request talk
          </Button>
          <Button size="sm" onClick={() => openDialog("log")}>
            <Plus className="size-4" /> Log talk
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : talks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          No toolbox talks yet. Use{" "}
          <span className="font-medium">Request talk</span> to assign one to
          contractors (with email), or{" "}
          <span className="font-medium">Log talk</span> to record one you&apos;ve
          already delivered.
        </div>
      ) : (
        <>
          {requested.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Outstanding requests ({requested.length})
              </h3>
              {requested.map((t) => (
                <TalkCard
                  key={t.id}
                  talk={t}
                  contractorLabel={contractorLabel}
                  busy={actioningId === t.id}
                  onComplete={() => markComplete(t)}
                  onCancel={() => cancelTalk(t)}
                />
              ))}
            </section>
          )}
          {historical.length > 0 && (
            <section className="space-y-2">
              {requested.length > 0 && (
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  History
                </h3>
              )}
              {historical.map((t) => (
                <TalkCard
                  key={t.id}
                  talk={t}
                  contractorLabel={contractorLabel}
                  busy={false}
                />
              ))}
            </section>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "request" ? "Request a toolbox talk" : "Log a toolbox talk"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "request" && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                The linked contractors will receive an email with the topic,
                reason, due date and any attachments. Mark the talk complete
                after they&apos;ve run it.
              </p>
            )}
            <div>
              <Label htmlFor="tb-topic">Topic *</Label>
              <Input
                id="tb-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={
                  mode === "request"
                    ? "e.g. PPE — hi-vis and hard hats on site"
                    : "e.g. Working at height refresher"
                }
              />
            </div>
            <div>
              <Label htmlFor="tb-notes">
                {mode === "request" ? "Reason / what triggered this" : "Notes"}
              </Label>
              <Textarea
                id="tb-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={
                  mode === "request"
                    ? "e.g. Spotted a worker on Plot 12 without a top on. Need a refresher with the groundworks crew before tomorrow."
                    : undefined
                }
              />
            </div>
            <div>
              <Label>
                {mode === "request"
                  ? "Contractors to brief"
                  : "Link contractors"}
              </Label>
              <p className="mb-1.5 mt-0.5 text-[11px] text-muted-foreground">
                {mode === "request"
                  ? "Each gets an email with the topic, reason and attachments. Only contractors with an email on file will be sent to."
                  : "Linked contractors see this talk in their Contractor Comms."}
              </p>
              {contractors.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">
                  No contractors on file yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contractors.map((c) => {
                    const selected = selectedContractorIds.includes(c.id);
                    const noEmail = mode === "request" && !c.email;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelectedContractorIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((x) => x !== c.id)
                              : [...prev, c.id],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-blue-400 bg-blue-50 text-blue-800"
                            : "border-border bg-white text-muted-foreground hover:bg-slate-50"
                        }`}
                        title={noEmail ? "No email on file — won't be emailed" : undefined}
                      >
                        {c.company || c.name}
                        {noEmail && (
                          <span className="ml-1 text-amber-600">·no email</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {mode === "log" ? (
              <>
                <div>
                  <Label htmlFor="tb-attendees">Attendees</Label>
                  <Input
                    id="tb-attendees"
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    placeholder="Jim, Sarah, Mike's plumbers"
                  />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Free text — any worker names that aren&apos;t Contacts.
                  </p>
                </div>
                <div>
                  <Label htmlFor="tb-when">When (defaults to now)</Label>
                  <Input
                    id="tb-when"
                    type="datetime-local"
                    value={deliveredAt}
                    onChange={(e) => setDeliveredAt(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="tb-due">Due by (optional)</Label>
                  <Input
                    id="tb-due"
                    type="datetime-local"
                    value={dueBy}
                    onChange={(e) => setDueBy(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                  Email linked contractors now
                </label>
              </>
            )}
            <div>
              <Label htmlFor="tb-doc">Attachments (optional)</Label>
              <div className="mt-1 space-y-1.5">
                <input
                  ref={fileInputRef}
                  id="tb-doc"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const next = Array.from(e.target.files ?? []);
                    if (next.length > 0) {
                      setDocFiles((prev) => [...prev, ...next]);
                    }
                    // Reset the input so re-picking the same file works.
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                {docFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <FileText
                        className="size-3.5 shrink-0 text-slate-500"
                        aria-hidden
                      />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-slate-400">
                        ({formatBytes(f.size)})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDocFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5"
                >
                  <Paperclip className="size-3.5" aria-hidden />
                  {docFiles.length === 0 ? "Choose files…" : "Add more"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={submit} disabled={submitting || !topic.trim()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting
                ? mode === "request"
                  ? "Sending…"
                  : "Logging…"
                : mode === "request"
                  ? "Request"
                  : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Card sub-component ----------

function TalkCard({
  talk: t,
  contractorLabel,
  busy,
  onComplete,
  onCancel,
}: {
  talk: Talk;
  contractorLabel: (id: string) => string;
  busy: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const atts = effectiveAttachments(t);
  const stamp = t.deliveredAt || t.requestedAt;
  const isRequested = t.status === "REQUESTED";
  const isCancelled = t.status === "CANCELLED";

  return (
    <div
      className={`rounded-lg border p-3 ${
        isRequested
          ? "border-amber-200 bg-amber-50/40"
          : isCancelled
            ? "border-slate-200 bg-slate-50 opacity-75"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <p
            className={`font-medium ${isCancelled ? "line-through text-slate-500" : ""}`}
          >
            {t.topic}
          </p>
          <StatusBadge status={t.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {isRequested ? "Requested " : ""}
          {format(parseISO(stamp), "dd MMM yyyy, HH:mm")}
        </p>
      </div>

      {isRequested && t.dueBy && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-800">
          <Clock className="size-3" aria-hidden />
          Due by {format(parseISO(t.dueBy), "dd MMM yyyy, HH:mm")}
        </p>
      )}

      {t.contractorIds.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
          <span className="font-medium text-slate-700">
            {isRequested ? "Assigned to:" : "Contractors:"}
          </span>
          {t.contractorIds.map((cid) => (
            <span
              key={cid}
              className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700"
            >
              {contractorLabel(cid)}
            </span>
          ))}
        </p>
      )}

      {t.emailSentAt && t.emailSentToCount && t.emailSentToCount > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
          <Mail className="size-3" aria-hidden />
          Emailed {t.emailSentToCount} contractor
          {t.emailSentToCount !== 1 ? "s" : ""} on{" "}
          {format(parseISO(t.emailSentAt), "dd MMM HH:mm")}
        </p>
      )}

      {t.attendees && !isRequested && (
        <p className="mt-1 text-xs">
          <span className="font-medium text-slate-700">Attendees:</span>{" "}
          <span className="text-slate-600">{t.attendees}</span>
        </p>
      )}

      {t.notes && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
          {t.notes}
        </p>
      )}

      {atts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {atts.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              <FileText className="size-3 shrink-0" aria-hidden />
              <span className="max-w-[200px] truncate">{a.fileName}</span>
              {a.size != null && (
                <span className="shrink-0 text-slate-500">
                  ({formatBytes(a.size)})
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {isRequested && (onComplete || onCancel) && (
        <div className="mt-3 flex items-center gap-2">
          {onComplete && (
            <Button size="sm" disabled={busy} onClick={onComplete}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Mark complete
            </Button>
          )}
          {onCancel && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onCancel}
            >
              <XCircle className="size-3.5" />
              Cancel request
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Talk["status"] }) {
  if (status === "REQUESTED") {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
        Requested
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        Cancelled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
      Completed
    </span>
  );
}
