"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * (#191) Reusable lateness display for any scope: site / plot / job /
 * order / contact. Renders a stat strip + a list of events with
 * inline reason attribution.
 *
 * Mount with one of: siteId, plotId, jobId, orderId, contactId.
 * Status filter defaults to "open" — pass "all" to include resolved
 * history (used by Site Story + Job Detail history strip).
 */

export interface LatenessEventDTO {
  id: string;
  kind: string;
  targetType: string;
  targetId: string;
  wentLateOn: string;
  daysLate: number;
  resolvedAt: string | null;
  reasonCode: string;
  reasonNote: string | null;
  attributedContactId: string | null;
  attributedContact: { id: string; name: string; company: string | null } | null;
  recordedBy: { id: string; name: string } | null;
  job: { id: string; name: string } | null;
  plot: { id: string; plotNumber: string | null; name: string } | null;
  order: { id: string; itemsDescription: string | null; supplier: { id: string; name: string } } | null;
}

const KIND_LABEL: Record<string, string> = {
  JOB_END_OVERDUE: "Overdue end",
  JOB_START_OVERDUE: "Late start",
  ORDER_DELIVERY_OVERDUE: "Late delivery",
  ORDER_SEND_OVERDUE: "Order not sent",
};

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "OTHER", label: "Not yet attributed" },
  { value: "WEATHER_RAIN", label: "Weather — rain" },
  { value: "WEATHER_TEMPERATURE", label: "Weather — temperature" },
  { value: "WEATHER_WIND", label: "Weather — wind" },
  { value: "MATERIAL_LATE", label: "Material — late delivery" },
  { value: "MATERIAL_WRONG", label: "Material — wrong / damaged" },
  { value: "MATERIAL_SHORT", label: "Material — short / undersupplied" },
  { value: "LABOUR_NO_SHOW", label: "Labour — contractor no-show" },
  { value: "LABOUR_SHORT", label: "Labour — short-staffed" },
  { value: "DESIGN_CHANGE", label: "Design change" },
  { value: "SPEC_CLARIFICATION", label: "Spec clarification" },
  { value: "PREDECESSOR_LATE", label: "Predecessor late" },
  { value: "ACCESS_BLOCKED", label: "Access blocked" },
  { value: "INSPECTION_FAILED", label: "Inspection failed" },
];

interface Props {
  siteId?: string;
  plotId?: string;
  jobId?: string;
  orderId?: string;
  contactId?: string;
  status?: "open" | "resolved" | "all";
  /** Compact mode: just the header + total — no event list. Used in
   *  Plot Detail / Job Detail panels where space is tight. */
  compact?: boolean;
}

export function LatenessSummary(props: Props) {
  const { status = "open", compact = false } = props;
  const toast = useToast();
  const [events, setEvents] = useState<LatenessEventDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status });
    if (props.siteId) params.set("siteId", props.siteId);
    if (props.plotId) params.set("plotId", props.plotId);
    if (props.jobId) params.set("jobId", props.jobId);
    if (props.orderId) params.set("orderId", props.orderId);
    if (props.contactId) params.set("contactId", props.contactId);
    try {
      const res = await fetch(`/api/lateness?${params}`, { cache: "no-store" });
      if (res.ok) setEvents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [props.siteId, props.plotId, props.jobId, props.orderId, props.contactId, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-3 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-3.5 animate-spin" /> Loading lateness…
      </div>
    );
  }
  if (!events || events.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-lg border border-dashed bg-white p-3 text-center text-xs text-muted-foreground">
        Nothing late here. ✓
      </div>
    );
  }

  const open = events.filter((e) => !e.resolvedAt);
  const resolved = events.filter((e) => e.resolvedAt);
  const totalDays = events.reduce((sum, e) => sum + e.daysLate, 0);

  // Reason breakdown.
  const reasonCounts = new Map<string, number>();
  for (const e of events) {
    reasonCounts.set(e.reasonCode, (reasonCounts.get(e.reasonCode) ?? 0) + e.daysLate);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden />
          <span className="text-sm font-semibold">
            {open.length > 0
              ? `${open.length} open · ${totalDays} working day${totalDays === 1 ? "" : "s"} lost`
              : `${resolved.length} resolved · ${totalDays} working day${totalDays === 1 ? "" : "s"} historically`}
          </span>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {!compact && expanded && (
        <div className="border-t">
          {topReasons.length > 0 && (
            <div className="border-b px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Top reasons
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topReasons.map(([code, days]) => {
                  const label = REASON_OPTIONS.find((r) => r.value === code)?.label ?? code;
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="text-slate-500">·{days}d</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <ul className="divide-y">
            {events.map((e) => (
              <LatenessRow key={e.id} event={e} onChange={refresh} toast={toast} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LatenessRow({
  event,
  onChange,
  toast,
}: {
  event: LatenessEventDTO;
  onChange: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editing, setEditing] = useState(false);
  const [reasonCode, setReasonCode] = useState(event.reasonCode);
  const [reasonNote, setReasonNote] = useState(event.reasonNote ?? "");
  const [saving, setSaving] = useState(false);

  const targetLabel = event.job
    ? `Job · ${event.job.name}`
    : event.order
      ? `Order · ${event.order.supplier.name}${event.order.itemsDescription ? ` · ${event.order.itemsDescription}` : ""}`
      : "Item";
  const plotLabel = event.plot
    ? event.plot.plotNumber
      ? `Plot ${event.plot.plotNumber}`
      : event.plot.name
    : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lateness/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode, reasonNote: reasonNote || null }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Couldn't save attribution"));
        return;
      }
      setEditing(false);
      toast.success("Reason saved");
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium text-slate-900">{targetLabel}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            event.resolvedAt ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {event.resolvedAt ? "Resolved" : `${event.daysLate}d`}
        </span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="size-3" aria-hidden />
        <span>{KIND_LABEL[event.kind] ?? event.kind}</span>
        <span>·</span>
        <span>Went late {format(new Date(event.wentLateOn), "d MMM")}</span>
        {plotLabel && (
          <>
            <span>·</span>
            <span>{plotLabel}</span>
          </>
        )}
        {event.resolvedAt && (
          <>
            <span>·</span>
            <CheckCircle2 className="size-3 text-emerald-600" aria-hidden />
            <span>Resolved {format(new Date(event.resolvedAt), "d MMM")}</span>
          </>
        )}
      </p>

      {!editing ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
            {REASON_OPTIONS.find((r) => r.value === event.reasonCode)?.label ?? event.reasonCode}
          </span>
          {event.attributedContact && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              <User className="size-3" aria-hidden />
              {event.attributedContact.company || event.attributedContact.name}
            </span>
          )}
          {event.reasonNote && (
            <span className="text-[11px] italic text-muted-foreground">
              &ldquo;{event.reasonNote}&rdquo;
            </span>
          )}
          {!event.resolvedAt && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] font-medium text-blue-600 hover:underline"
            >
              Set reason
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5 rounded border bg-slate-50/50 p-2">
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full rounded border bg-white px-2 py-1.5 text-xs"
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Optional note (what specifically happened)"
            className="w-full rounded border bg-white px-2 py-1.5 text-xs"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs">
              {saving ? <Loader2 className="size-3 animate-spin" /> : null}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReasonCode(event.reasonCode);
                setReasonNote(event.reasonNote ?? "");
                setEditing(false);
              }}
              disabled={saving}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
