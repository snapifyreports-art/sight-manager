"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, HardHat, Loader2 } from "lucide-react";
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
 * (May 2026 audit #176) Toolbox talk log per site.
 */

interface Talk {
  id: string;
  topic: string;
  notes: string | null;
  attendees: string | null;
  deliveredAt: string;
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
      const res = await fetch(`/api/sites/${siteId}/toolbox-talks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          notes: notes || null,
          attendees: attendees || null,
          deliveredAt: deliveredAt || undefined,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to log"));
        return;
      }
      setOpen(false);
      setTopic("");
      setNotes("");
      setAttendees("");
      setDeliveredAt("");
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
