"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, HardHat, Loader2, Paperclip, FileText, X } from "lucide-react";
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
 * (May 2026 audit #176, #175) Toolbox talk log per site. Each talk can
 * optionally carry one attached document (signed register, slide deck,
 * RAMS reference) — uploaded to the Supabase photos bucket and shown
 * inline on the talk card.
 */

interface Talk {
  id: string;
  topic: string;
  notes: string | null;
  attendees: string | null;
  deliveredAt: string;
  // (#175) Optional attachment.
  documentUrl: string | null;
  documentFileName: string | null;
  documentSize: number | null;
  documentMimeType: string | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SiteToolboxTalks({ siteId }: { siteId: string }) {
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function submit() {
    if (!topic.trim()) return;
    setSubmitting(true);
    try {
      // (#175) If a doc is attached, send as FormData. Otherwise stay
      // JSON for the simple case so existing callers / scripts still
      // work unchanged.
      let res: Response;
      if (docFile) {
        const fd = new FormData();
        fd.append("topic", topic.trim());
        if (notes) fd.append("notes", notes);
        if (attendees) fd.append("attendees", attendees);
        if (deliveredAt) fd.append("deliveredAt", deliveredAt);
        fd.append("document", docFile);
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
            notes: notes || null,
            attendees: attendees || null,
            deliveredAt: deliveredAt || undefined,
          }),
        });
      }
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to log"));
        return;
      }
      setOpen(false);
      setTopic("");
      setNotes("");
      setAttendees("");
      setDeliveredAt("");
      setDocFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

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
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Log talk
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : talks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          No toolbox talks logged yet. Quick safety briefings — record the
          topic, who attended, and any notes. Each entry timestamps when it
          was delivered for the safety audit trail.
        </div>
      ) : (
        <div className="space-y-2">
          {talks.map((t) => (
            <div key={t.id} className="rounded-lg border bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{t.topic}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(t.deliveredAt), "dd MMM yyyy, HH:mm")}
                </p>
              </div>
              {t.attendees && (
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
              {/* (#175) Inline doc download link. */}
              {t.documentUrl && (
                <a
                  href={t.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <FileText className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{t.documentFileName || "Attachment"}</span>
                  {t.documentSize != null && (
                    <span className="shrink-0 text-slate-500">
                      ({formatBytes(t.documentSize)})
                    </span>
                  )}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log a toolbox talk</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tb-topic">Topic *</Label>
              <Input
                id="tb-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Working at height refresher"
              />
            </div>
            <div>
              <Label htmlFor="tb-attendees">Attendees</Label>
              <Input
                id="tb-attendees"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="Jim, Sarah, Mike's plumbers"
              />
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
            <div>
              <Label htmlFor="tb-notes">Notes</Label>
              <Textarea
                id="tb-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            {/* (#175) Optional document attachment — signed register,
                slide deck, RAMS reference, anything you want kept with
                the talk record. */}
            <div>
              <Label htmlFor="tb-doc">Attach a document (optional)</Label>
              <div className="mt-1">
                <input
                  ref={fileInputRef}
                  id="tb-doc"
                  type="file"
                  className="hidden"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                />
                {docFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <FileText className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                      <span className="truncate">{docFile.name}</span>
                      <span className="shrink-0 text-slate-400">
                        ({formatBytes(docFile.size)})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDocFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 gap-1.5"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    Choose file…
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={submit} disabled={submitting || !topic.trim()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Logging…" : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
