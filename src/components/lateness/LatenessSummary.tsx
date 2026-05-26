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
  attributedSupplierId: string | null;
  attributedSupplier: { id: string; name: string } | null;
  recordedBy: { id: string; name: string } | null;
  job: { id: string; name: string } | null;
  plot: { id: string; plotNumber: string | null; name: string } | null;
  order: { id: string; itemsDescription: string | null; supplier: { id: string; name: string } } | null;
  // (May 2026) Specific manager-picked reason (order-send / order-
  // delivery lateness). More granular than `reasonCode` — when present,
  // it's what the UI shows. `excused` = manager marked "no programme
  // impact"; recorded for the audit trail, kept out of the headline
  // working-days-lost figure.
  delayReason: { id: string; label: string } | null;
  excused: boolean;
}

const KIND_LABEL: Record<string, string> = {
  JOB_END_OVERDUE: "Overdue end",
  JOB_START_OVERDUE: "Late start",
  ORDER_DELIVERY_OVERDUE: "Late delivery",
  ORDER_SEND_OVERDUE: "Order not sent",
};

// (May 2026 Keith request) "Needs attribution" predicate — the
// reasonCode default is OTHER, set by the lateness cron when no
// signal is available. Once a manager picks a reason, sets a
// delayReason, attributes a contractor/supplier, OR adds a note,
// the event is considered triaged. This lifts it out of the
// "needs a reason" prompt in the Daily Brief headline and the
// in-list sort, so genuinely-unattributed events surface first.
function needsAttribution(e: LatenessEventDTO): boolean {
  if (e.resolvedAt) return false;
  if (e.excused) return false;
  if (e.reasonCode && e.reasonCode !== "OTHER") return false;
  if (e.delayReason) return false;
  if (e.attributedContactId) return false;
  if (e.attributedSupplierId) return false;
  if (e.reasonNote && e.reasonNote.trim().length > 0) return false;
  return true;
}

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
  /** (May 2026 audit SM-P1) Start expanded rather than the default
   *  collapsed header. Used on Site Story where the user has already
   *  scrolled past significant context and shouldn't be made to click
   *  again to read the lateness breakdown. */
  defaultExpanded?: boolean;
}

export interface ContactOption {
  id: string;
  name: string;
  company: string | null;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export function LatenessSummary(props: Props) {
  const { status = "open", compact = false, defaultExpanded = false } = props;
  const toast = useToast();
  const [events, setEvents] = useState<LatenessEventDTO[] | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  // (May 2026 Keith request) `userToggled` lets the auto-expand effect
  // only fire once per data-load; once the manager has explicitly
  // opened or closed the panel, we leave their choice alone instead of
  // fighting it on every refresh.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [userToggled, setUserToggled] = useState(false);

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

  // (May 2026 pattern sweep) Cancellation flag — rapid filter changes
  // (site/plot/job/order/contact) let a slower earlier response
  // overwrite the newer filter's results.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ status });
    if (props.siteId) params.set("siteId", props.siteId);
    if (props.plotId) params.set("plotId", props.plotId);
    if (props.jobId) params.set("jobId", props.jobId);
    if (props.orderId) params.set("orderId", props.orderId);
    if (props.contactId) params.set("contactId", props.contactId);
    fetch(`/api/lateness?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setEvents(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [props.siteId, props.plotId, props.jobId, props.orderId, props.contactId, status]);

  // (May 2026 audit SM-P0-3 / FC-P0) Fetch contractors once for the
  // inline attribution picker. Pre-fix the picker rendered reason +
  // note but NOT a contractor select — even though the API accepts it.
  // Managers had to leave the screen, go to the contact's page, and
  // attribute there. Now a Select renders alongside the reason
  // dropdown so attribution happens inline.
  //
  // (May 2026 audit S-P1) Suppliers also fetched in parallel so the
  // picker offers BOTH "Contractor (Contact)" and "Supplier" pools.
  // The attributedContactId / attributedSupplierId fields are
  // parallel; UI lets the manager pick one of either pool.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/contacts?type=CONTRACTOR", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch("/api/suppliers", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([contactRows, supplierRows]) => {
      if (cancelled) return;
      setContacts(
        (contactRows as Array<{ id: string; name: string; company: string | null }>)
          .map((r) => ({ id: r.id, name: r.name, company: r.company }))
          .sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name)),
      );
      setSuppliers(
        (supplierRows as Array<{ id: string; name: string }>)
          .map((s) => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // (May 2026 Keith request) Auto-expand the panel as soon as events
  // load IF there are unattributed open events. Respects any manual
  // toggle the manager has made since (userToggled). Run-once via
  // events being the dep — re-renders without an event refresh
  // don't re-trigger.
  useEffect(() => {
    if (!events || compact || userToggled) return;
    const needs = events.some((e) => !e.resolvedAt && needsAttribution(e));
    if (needs) setExpanded(true);
  }, [events, compact, userToggled]);

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
  // (May 2026) Excused lateness — manager marked "no programme impact"
  // (e.g. an order sent late but the material wasn't needed early). It's
  // recorded for the audit trail but must NOT inflate the working-days-
  // lost headline, the same way weather-excused delays are kept apart.
  const counted = (e: LatenessEventDTO) => !e.excused;
  const excusedCount = events.filter((e) => e.excused).length;
  // (May 2026 Keith request) Count of open events still flagged "OTHER"
  // with no attribution — these are the ones managers need to attend
  // to in order for analytics to mean anything (the Site Story chips
  // were 38 "OTHER" because triage wasn't surfaced anywhere prominent).
  const needsAttributionEvents = open.filter(needsAttribution);
  const needsCount = needsAttributionEvents.length;
  // (May 2026 audit D-P0-3) Split open vs resolved working-days. Pre-fix
  // the headline conflated them when status=all so the Delay Report tab
  // said "47 WD lost" (= open + historical resolved) while the weekly
  // digest email said "12 WD lost" (= open only). Director couldn't
  // reconcile. Now: always two numbers, never one blended figure.
  const openDays = open.filter(counted).reduce((sum, e) => sum + e.daysLate, 0);
  const resolvedDays = resolved
    .filter(counted)
    .reduce((sum, e) => sum + e.daysLate, 0);

  // (May 2026 Keith request) Sort so needs-reason events float to the
  // top of the expanded list. Within each bucket, fall back to the
  // API's order (resolved-first-asc-nulls-first, then wentLateOn desc)
  // so the existing semantics survive.
  const sortedEvents = [...events].sort((a, b) => {
    const aN = needsAttribution(a) ? 0 : 1;
    const bN = needsAttribution(b) ? 0 : 1;
    if (aN !== bN) return aN - bN;
    return 0;
  });

  // Reason breakdown — keep summing all (non-excused) events so the
  // breakdown shows every reason that ever contributed (this is a "where
  // did the time go" lens, not a "what's open right now" lens). Prefer
  // the specific DelayReason label over the broad reasonCode enum.
  const reasonCounts = new Map<string, number>();
  for (const e of events) {
    if (e.excused) continue;
    const label =
      e.delayReason?.label ??
      REASON_OPTIONS.find((r) => r.value === e.reasonCode)?.label ??
      e.reasonCode;
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + e.daysLate);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Headline — always lead with the open figure when there is one; the
  // resolved figure tags onto the right when both exist. If only resolved
  // events exist (rare — usually means the user filtered to status=resolved
  // explicitly), show the historical figure. Excused events tag on at the
  // end so the count is visible without distorting the WD-lost number.
  // (May 2026 Keith request) The "X need a reason" tag goes next to the
  // open count so managers triage the unattributed ones first — pre-fix
  // these were silently rolled into the "OTHER" bucket and never chased.
  const excusedTag = excusedCount > 0 ? ` · ${excusedCount} excused` : "";
  const needsTag = needsCount > 0 ? ` · ${needsCount} need a reason` : "";
  const headline =
    (open.length > 0
      ? resolved.length > 0
        ? `${open.length} open · ${openDays} WD lost (+${resolvedDays} WD historic)`
        : `${open.length} open · ${openDays} working day${openDays === 1 ? "" : "s"} lost`
      : `${resolved.length} resolved · ${resolvedDays} working day${resolvedDays === 1 ? "" : "s"} historically`) +
    needsTag +
    excusedTag;

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          // Stop the auto-expand effect from fighting the manager's
          // explicit collapse on the next refresh.
          setUserToggled(true);
        }}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
          needsCount > 0 ? "bg-amber-50" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={`size-4 ${needsCount > 0 ? "text-amber-700" : "text-amber-600"}`}
            aria-hidden
          />
          <span className="text-sm font-semibold">{headline}</span>
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
                {topReasons.map(([label, days]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-slate-500">·{days}d</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <ul className="divide-y">
            {sortedEvents.map((e) => (
              <LatenessRow key={e.id} event={e} contacts={contacts} suppliers={suppliers} onChange={refresh} toast={toast} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LatenessRow({
  event,
  contacts,
  suppliers,
  onChange,
  toast,
}: {
  event: LatenessEventDTO;
  contacts: ContactOption[];
  suppliers: SupplierOption[];
  onChange: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editing, setEditing] = useState(false);
  const [reasonCode, setReasonCode] = useState(event.reasonCode);
  const [reasonNote, setReasonNote] = useState(event.reasonNote ?? "");
  const [attributedContactId, setAttributedContactId] = useState<string>(
    event.attributedContactId ?? "",
  );
  const [attributedSupplierId, setAttributedSupplierId] = useState<string>(
    event.attributedSupplierId ?? "",
  );
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
        body: JSON.stringify({
          reasonCode,
          reasonNote: reasonNote || null,
          // null clears attribution; empty string passes "no choice".
          attributedContactId: attributedContactId || null,
          attributedSupplierId: attributedSupplierId || null,
        }),
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

  // (May 2026 Keith request) Visually flag rows still needing a reason.
  // The left border + soft amber tint signals at a glance which rows
  // the manager owes work on, without making the rest of the list noisy.
  const needs = needsAttribution(event);

  return (
    <li
      className={`px-3 py-2 text-sm ${needs ? "border-l-4 border-l-amber-400 bg-amber-50/50" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="min-w-0 truncate font-medium text-slate-900">{targetLabel}</p>
          {needs && (
            <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
              Needs reason
            </span>
          )}
        </div>
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
          {/* (May 2026) Prefer the specific manager-picked reason over
              the broad reasonCode enum when one was captured. */}
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
            {event.delayReason?.label ??
              REASON_OPTIONS.find((r) => r.value === event.reasonCode)?.label ??
              event.reasonCode}
          </span>
          {/* (May 2026) "No programme impact" — recorded but excluded
              from the working-days-lost headline. */}
          {event.excused && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3" aria-hidden />
              No programme impact
            </span>
          )}
          {event.attributedContact && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              <User className="size-3" aria-hidden />
              {event.attributedContact.company || event.attributedContact.name}
            </span>
          )}
          {/* (May 2026 audit S-P1) Supplier badge — distinct colour from
              contractor so the manager can see at a glance whether the
              slip is attributed to a contractor or a supplier. */}
          {event.attributedSupplier && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
              <User className="size-3" aria-hidden />
              {event.attributedSupplier.name}
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
              className={
                needs
                  ? "rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                  : "text-[11px] font-medium text-blue-600 hover:underline"
              }
            >
              {needs ? "Attribute reason" : "Set reason"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5 rounded border bg-slate-50/50 p-2">
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full rounded border bg-white px-2 py-1.5 text-xs"
            aria-label="Lateness reason"
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {/* (May 2026 audit SM-P0-3) Contractor picker — previously
              absent. API has always accepted attributedContactId,
              just had no UI surface. */}
          {contacts.length > 0 && (
            <select
              value={attributedContactId}
              onChange={(e) => setAttributedContactId(e.target.value)}
              className="w-full rounded border bg-white px-2 py-1.5 text-xs"
              aria-label="Attribute to contractor"
            >
              <option value="">— No contractor attribution —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company ? `${c.company} (${c.name})` : c.name}
                </option>
              ))}
            </select>
          )}
          {/* (May 2026 audit S-P1) Supplier picker — parallel to the
              contractor picker above. Manager picks one or the other
              depending on whose responsibility the slip is. */}
          {suppliers.length > 0 && (
            <select
              value={attributedSupplierId}
              onChange={(e) => setAttributedSupplierId(e.target.value)}
              className="w-full rounded border bg-white px-2 py-1.5 text-xs"
              aria-label="Attribute to supplier"
            >
              <option value="">— No supplier attribution —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
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
                setAttributedContactId(event.attributedContactId ?? "");
                setAttributedSupplierId(event.attributedSupplierId ?? "");
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
