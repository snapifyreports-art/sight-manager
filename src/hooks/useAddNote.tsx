"use client";

/**
 * Single source of truth for "add a note to a job".
 *
 * Before: JobDetailClient, SiteWalkthrough, JobWeekPanel (NoteTab), and
 * DailySiteBrief each had their own note-add flow. Copy text drifted
 * ("Add Note" vs "Job Note" vs "Inline Note"), so did validation (some
 * allowed empty notes, some didn't) and submit-key behaviour.
 *
 * Now: every surface calls `openNoteDialog(job)` and renders `dialogs`.
 * Posts to /api/jobs/:id/actions with { action: "note", notes } — same
 * endpoint every implementation already used. On success, the note
 * appears in the job's timeline and Daily Brief activity feed.
 *
 * If you need to pre-pick a job from a list (e.g. walkthrough attaches a
 * note to any job on the plot), do that picker in the caller, then pass
 * the chosen job here.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface NotableJob {
  id: string;
  name: string;
}

interface AddNoteResult {
  /** Open the note dialog for a given job. */
  openNoteDialog: (job: NotableJob) => void;
  /** True while a note is submitting. */
  isLoading: boolean;
  /** JSX to render once in the component tree. */
  dialogs: ReactNode;
}

export function useAddNote(onSaved?: (jobId: string) => void): AddNoteResult {
  const toast = useToast();
  const [target, setTarget] = useState<NotableJob | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openNoteDialog = useCallback((job: NotableJob) => {
    setTarget(job);
    setText("");
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setText("");
  }, []);

  async function save() {
    if (!target || !text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${target.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: text.trim() }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to add note"));
        return;
      }
      toast.success("Note added");
      const jobId = target.id;
      close();
      onSaved?.(jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  const dialogs = (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="size-4" />
            Add Note
          </DialogTitle>
          <DialogDescription>
            Note for <span className="font-medium">{target?.name}</span>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Enter note..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="resize-none text-sm"
          autoFocus
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter submits — common power-user pattern.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button size="sm" disabled={submitting || !text.trim()} onClick={save}>
            {submitting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <StickyNote className="size-3.5 mr-1" />}
            Save Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openNoteDialog, isLoading: submitting, dialogs };
}
