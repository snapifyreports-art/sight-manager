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
  const [expanded, setExpanded] = useState(defaultExpanded);

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
  // (May 2026 audit D-P0-3) Split open vs resolved working-days. Pre-fix
  // the headline conflated them when status=all so the Delay Report tab
  // said "47 WD lost" (= open + historical resolved) while the weekly
  // digest email said "12 WD lost" (= open only). Director couldn't
  // reconcile. Now: always two numbers, never one blended figure.
  const openDays = open.reduce((sum, e) => sum + e.daysLate, 0);
  const resolvedDays = resolved.reduce((sum, e) => sum + e.daysLate, 0);

  // Reason breakdown — keep summing all events so the breakdown shows
  // every reason that ever contributed (this is a "where did the time
  // go" lens, not a "what's open right now" lens).
  const reasonCounts = new Map<string, number>();
  for (const e of events) {
    reasonCounts.set(e.reasonCode, (reasonCounts.get(e.reasonCode) ?? 0) + e.daysLate);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Headline — always lead with the open figure when there is one; the
  // resolved figure tags onto the right when both exist. If only resolved
  // events exist (rare — usually means the user filtered to status=resolved
  // explicitly), show the historical figure.
  const headline =
    open.length > 0
      ? resolved.length > 0
        ? `${open.length} open · ${openDays} WD lost (+${resolvedDays} WD historic)`
        : `${open.length} open · ${openDays} working day${openDays === 1 ? "" : "s"} lost`
      : `${resolved.length} resolved · ${resolvedDays} working day${resolvedDays === 1 ? "" : "s"} historically`;

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
