"use client";

import { useEffect, useState } from "react";
import { History, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { TemplateAuditEventData } from "./types";

/**
 * Lightweight change-log panel for a template. Collapsed by default.
 *
 * Drives off the TemplateAuditEvent table — events are written by the
 * various API mutations (created, renamed, marked_live, marked_draft,
 * cloned_from, variant_added/removed). Future commits can extend the
 * write side; this view will show whatever's in the table.
 */
export function TemplateAuditLog({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TemplateAuditEventData[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || events !== null) return;
    // (May 2026 pattern sweep) Guard with .ok + cancellation flag.
    let cancelled = false;
    setLoading(true);
    fetch(`/api/plot-templates/${templateId}/audit`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setEvents(Array.isArray(d) ? d : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, events, templateId]);

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        <History className="size-4 text-blue-600" />
        <span className="font-medium">Change log</span>
        {events && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {events.length}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>
      </button>
      {open && (
        <div className="border-t">
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : events && events.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No changes recorded yet.
            </p>
          ) : (
            <ul className="max-h-[280px] divide-y overflow-y-auto text-xs">
              {events?.map((e) => (
                <li key={e.id} className="flex items-start gap-2 px-3 py-1.5">
                  <ActionDot action={e.action} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {e.detail || prettyAction(e.action)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {e.userName ?? "system"} ·{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(e.createdAt))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ActionDot({ action }: { action: string }) {
  const tone =
    action === "created" || action === "cloned_from"
      ? "bg-blue-500"
      : action.includes("removed") || action.includes("draft")
        ? "bg-amber-500"
        : action.includes("added") || action.includes("live")
          ? "bg-emerald-500"
          : "bg-slate-400";
  return (
    <span
      className={`mt-1 inline-block size-1.5 shrink-0 rounded-full ${tone}`}
    />
  );
}

function prettyAction(action: string): string {
  return action
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
