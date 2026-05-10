"use client";

import { useState } from "react";
import { PlayCircle, CheckCircle2, MessageSquare, Loader2 } from "lucide-react";

/**
 * (May 2026 contractor self-service) Three-action row attached to a
 * contractor-owned job: "I've started", "I've finished", "Add note".
 *
 * Doesn't change job.status (admin still has to actually start/complete
 * via the dashboard). It writes JobAction rows so the audit trail
 * shows the contractor's self-attestation, plus EventLog so the
 * manager sees it in the daily-brief feed.
 */
export function ContractorJobActionRow({
  token,
  jobId,
  startedAlready,
  completedAlready,
}: {
  token: string;
  jobId: string;
  startedAlready: boolean;
  completedAlready: boolean;
}) {
  const [started, setStarted] = useState(startedAlready);
  const [completed, setCompleted] = useState(completedAlready);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "confirm_start" | "confirm_complete" | "note", notes?: string) {
    setBusyAction(action);
    setError(null);
    try {
      const res = await fetch(`/api/contractor-share/${token}/job-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action, notes: notes ?? null }),
      });
      if (res.ok) {
        if (action === "confirm_start") setStarted(true);
        if (action === "confirm_complete") setCompleted(true);
        if (action === "note") {
          setNoteSaved(true);
          setNoteText("");
          setTimeout(() => {
            setNoteOpen(false);
            setNoteSaved(false);
          }, 1500);
        }
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        {started ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3" aria-hidden /> Start confirmed
          </span>
        ) : (
          <button
            onClick={() => send("confirm_start")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            {busyAction === "confirm_start" ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="size-3" aria-hidden />
            )}
            I&apos;ve started
          </button>
        )}
        {completed ? (
          <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
            <CheckCircle2 className="size-3" aria-hidden /> Completion confirmed
          </span>
        ) : (
          <button
            onClick={() => send("confirm_complete")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
          >
            {busyAction === "confirm_complete" ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="size-3" aria-hidden />
            )}
            I&apos;ve finished
          </button>
        )}
        <button
          onClick={() => setNoteOpen(!noteOpen)}
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <MessageSquare className="size-3" aria-hidden />
          Add note
        </button>
      </div>
      {noteOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            placeholder="e.g. Materials short, need 5 more lengths of soffit board"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setNoteOpen(false)}
              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => send("note", noteText.trim())}
              disabled={!noteText.trim() || busyAction !== null}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busyAction === "note" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                "Send"
              )}
            </button>
          </div>
          {noteSaved && (
            <p className="text-[11px] text-emerald-700">Note sent to the site team.</p>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
