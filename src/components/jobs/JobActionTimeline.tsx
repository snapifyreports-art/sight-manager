"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Loader2,
  Play,
  Pause,
  CheckCircle2,
  Pencil,
  StickyNote,
  Shield,
  HelpCircle,
} from "lucide-react";

/**
 * (May 2026 Surfacing audit) Append-only audit timeline for a single
 * job. JobAction rows are written by every start/stop/complete/signoff/
 * note flow (see /api/jobs/[id]/actions POST) but the UI never read
 * them back — managers could not see "who actioned what when" without
 * cross-referencing EventLog. This component renders the rows
 * chronologically with action-type icons + notes.
 */

interface ActionRow {
  id: string;
  action: string;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

const ICON: Record<string, typeof Play> = {
  start: Play,
  stop: Pause,
  complete: CheckCircle2,
  signoff: Shield,
  edit: Pencil,
  note: StickyNote,
};

const COLOR: Record<string, string> = {
  start: "text-green-600 bg-green-50",
  stop: "text-red-600 bg-red-50",
  complete: "text-emerald-600 bg-emerald-50",
  signoff: "text-emerald-700 bg-emerald-100",
  edit: "text-blue-600 bg-blue-50",
  note: "text-slate-600 bg-slate-100",
};

const LABEL: Record<string, string> = {
  start: "Started",
  stop: "Stopped",
  complete: "Completed",
  signoff: "Signed off",
  edit: "Edited",
  note: "Note added",
};

export function JobActionTimeline({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/jobs/${jobId}/actions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setRows(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading timeline…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground">
        No actions recorded against this job yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const Icon = ICON[r.action] ?? HelpCircle;
        const color = COLOR[r.action] ?? "text-slate-600 bg-slate-100";
        const label = LABEL[r.action] ?? r.action;
        return (
          <li
            key={r.id}
            className="flex gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${color}`}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-medium text-slate-900">{label}</p>
                {r.user && (
                  <span className="text-xs text-muted-foreground">
                    by <span className="font-medium">{r.user.name}</span>
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {format(parseISO(r.createdAt), "dd MMM yy · HH:mm")}
                </span>
              </div>
              {r.notes && (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">
                  {r.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
