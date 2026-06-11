"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Trash2, Loader2, ExternalLink, ShieldAlert, CalendarRange, Search, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HelpTip } from "@/components/shared/HelpTip";
import { InspectionStatusBadge, InspectionTypeBadge } from "@/components/shared/StatusBadge";
import { SnagDialog } from "@/components/snags/SnagDialog";
import { useInspectionAction, type InspectionFinding } from "@/hooks/useInspectionAction";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { inspectionDisplayStatus, inspectionTypeLabel, INSPECTION_TYPE_META } from "@/lib/inspection-doctype";

interface Insp {
  id: string;
  name: string;
  type: string;
  status: "SCHEDULED" | "BOOKED" | "PASSED" | "FAILED" | "OVERDUE";
  scheduledDate: string;
  bookedDate: string | null;
  bookingLeadWeeks: number | null;
  isBlocking?: boolean;
  anchorJobId: string | null;
  certificateDocumentId: string | null;
  plot: { id: string; name: string; plotNumber: string | null; siteId: string; site: { name: string } };
  anchorJob: { id: string; name: string } | null;
  inspector: { id: string; name: string; company: string | null } | null;
  certificate: { id: string; name: string; url: string } | null;
  _count: { snags: number; ncrs: number };
}

/** Date by which a SCHEDULED inspection should be booked (lead window). */
function bookByDate(i: Insp): Date | null {
  if (i.bookingLeadWeeks == null || i.status !== "SCHEDULED") return null;
  const d = new Date(i.scheduledDate);
  d.setDate(d.getDate() - i.bookingLeadWeeks * 7);
  return d;
}

const FILTERS = ["All", "Upcoming", "Overdue", "Passed", "Failed"] as const;
type Filter = (typeof FILTERS)[number];

type ContactOpt = { id: string; name: string; company: string | null };

export function InspectionsClient({ initial, canManage, siteId, embedded }: { initial: Insp[]; canManage: boolean; siteId?: string; embedded?: boolean }) {
  const [items, setItems] = useState<Insp[]>(initial);
  const [filter, setFilter] = useState<Filter>("Upcoming");
  const [dialog, setDialog] = useState<{ kind: "pass" | "fail"; insp: Insp } | null>(null);
  const [notify, setNotify] = useState<Insp | null>(null);
  const [move, setMove] = useState<Insp | null>(null);
  // (Jun 2026 D8) Book opens a one-field date dialog (prefilled with the
  // scheduled date) instead of booking blind on click.
  const [book, setBook] = useState<Insp | null>(null);
  // (Jun 2026 Q9) Site / type / text filters — the cross-site list gets
  // unusable past ~20 rows without them. Site filter hidden when embedded.
  const [siteFilter, setSiteFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  // (Jun 2026 S9) Skeleton while the embedded mount-fetch is in flight.
  const [loading, setLoading] = useState(false);
  // (Jun 2026 S11) ?focus=<id> deep-link target — alerts/pushes land the
  // manager on the exact row, scrolled + ringed. Read from
  // window.location (not useSearchParams) so the embedded site-tab copy
  // works without a Suspense boundary.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  // (Jun 2026 S8) Contractor contacts for the inline inspector picker.
  const [contacts, setContacts] = useState<ContactOpt[]>([]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inspections${siteId ? `?siteId=${siteId}` : ""}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // When embedded in a site tab (no server-rendered initial), fetch on mount.
  useEffect(() => {
    if (siteId && initial.length === 0) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f) {
      setFocusId(f);
      setFilter("All"); // the target may be passed/failed — don't hide it
    }
  }, []);

  useEffect(() => {
    if (!focusId || items.length === 0) return;
    const t = setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    return () => clearTimeout(t);
  }, [focusId, items.length]);

  useEffect(() => {
    if (!canManage) return;
    fetch(`/api/contacts?type=CONTRACTOR`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all) => setContacts((Array.isArray(all) ? all : []).map((c: ContactOpt) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
  }, [canManage]);

  const action = useInspectionAction({ onChange: refetch });

  // Distinct sites present in the data (for the cross-site filter).
  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) m.set(i.plot.siteId, i.plot.site.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "Upcoming" && !(i.status === "SCHEDULED" || i.status === "BOOKED")) return false;
      if (filter === "Overdue" && i.status !== "OVERDUE") return false;
      if (filter === "Passed" && i.status !== "PASSED") return false;
      if (filter === "Failed" && i.status !== "FAILED") return false;
      if (siteFilter && i.plot.siteId !== siteFilter) return false;
      if (typeFilter && i.type !== typeFilter) return false;
      if (q) {
        const hay = `${i.name} ${i.plot.site.name} ${i.plot.plotNumber ?? i.plot.name} ${i.anchorJob?.name ?? ""} ${i.inspector?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, siteFilter, typeFilter, search]);

  const counts = useMemo(() => ({
    Overdue: items.filter((i) => i.status === "OVERDUE").length,
    Upcoming: items.filter((i) => i.status === "SCHEDULED" || i.status === "BOOKED").length,
    Failed: items.filter((i) => i.status === "FAILED").length,
  }), [items]);

  return (
    <div className={embedded ? "space-y-4" : "space-y-4 p-4 md:p-6"}>
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-6 text-amber-600" />
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold">
            Inspections
            <HelpTip title="About inspections">
              <p><strong>Hold-points</strong> are statutory or QA inspections (NHBC, Building Control, warranty, internal QA) that must happen at a point in the build.</p>
              <p><strong>Lifecycle:</strong> Scheduled → Booked → Passed / Failed. If a scheduled date passes with no result it goes <strong>Overdue</strong>.</p>
              <p>The date is <strong>derived from the anchor job</strong> and moves automatically when that job moves. A <strong>certificate is required to pass</strong>. Findings recorded at sign-off become snags or NCRs.</p>
              <p>A <strong>hard blocker</strong> (set on the template) prevents completing its anchor job until passed, unless you override with a reason.</p>
            </HelpTip>
          </h1>
          <p className="text-xs text-muted-foreground">
            {counts.Overdue > 0 && <span className="font-medium text-amber-600">{counts.Overdue} overdue · </span>}
            {counts.Upcoming} upcoming{counts.Failed > 0 ? ` · ${counts.Failed} failed` : ""} across your sites
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-amber-500 bg-amber-50 font-medium text-amber-700" : "border-input text-muted-foreground hover:bg-muted/40"}`}
          >
            {f}
            {f === "Overdue" && counts.Overdue > 0 ? ` (${counts.Overdue})` : ""}
          </button>
        ))}
        {!embedded && siteOptions.length > 1 && (
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground"
            aria-label="Filter by site"
          >
            <option value="">All sites</option>
            {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {Object.entries(INSPECTION_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-36 rounded-md border border-input bg-transparent pl-7 pr-2 text-xs"
            aria-label="Search inspections"
          />
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="divide-y rounded-lg border">
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex animate-pulse items-center gap-4 p-3">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-6 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No inspections {filter !== "All" ? `(${filter.toLowerCase()})` : "yet"}. They appear here when a plot is created from a
          template that defines inspections, or when you add one from a plot&apos;s Overview tab.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((i) => {
            const display = inspectionDisplayStatus(i.status, i.bookedDate);
            const urgent = i.status === "OVERDUE" && !display.bookedOverdue;
            const pending = action.isPending(i.id);
            const focused = focusId === i.id;
            return (
              <div
                key={i.id}
                ref={focused ? focusRef : undefined}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-3 ${focused ? "rounded-lg ring-2 ring-blue-500" : ""}`}
              >
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.name}</span>
                    <InspectionTypeBadge type={i.type} />
                    {i.isBlocking && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-red-700" title="Hard blocker — blocks completing the anchor job until passed">
                        <ShieldAlert className="size-2.5" /> blocks
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Link href={`/sites/${i.plot.siteId}?tab=plots`} className="hover:underline">
                      {i.plot.site.name} · Plot {i.plot.plotNumber ?? i.plot.name}
                    </Link>
                    {i.anchorJob ? <span> · after {i.anchorJob.name}</span> : null}
                  </div>
                </div>

                <div className="text-sm">
                  <div className={urgent ? "font-medium text-red-600" : display.bookedOverdue ? "font-medium text-amber-600" : ""}>
                    {format(new Date(i.scheduledDate), "EEE d MMM yyyy")}
                  </div>
                  {canManage && (i.status === "SCHEDULED" || i.status === "BOOKED" || i.status === "OVERDUE") ? (
                    <select
                      value={i.inspector?.id ?? ""}
                      disabled={pending}
                      onChange={(e) => action.patch(i.id, { inspectorContactId: e.target.value || null })}
                      className="mt-0.5 h-6 max-w-[150px] rounded border border-input bg-transparent px-1 text-xs text-muted-foreground"
                      title="Assign the inspector"
                    >
                      <option value="">No inspector set</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                    </select>
                  ) : (
                    <div className="text-xs text-muted-foreground">{i.inspector ? i.inspector.name : "No inspector set"}</div>
                  )}
                  {(() => {
                    const by = bookByDate(i);
                    return by ? <div className="text-[11px] font-medium text-amber-600">book by {format(by, "d MMM")}</div> : null;
                  })()}
                </div>

                <InspectionStatusBadge status={i.status} bookedDate={i.bookedDate} />

                {(i._count.snags > 0 || i._count.ncrs > 0) && (
                  <Link
                    href={`/sites/${i.plot.siteId}?tab=${i._count.ncrs > 0 && i._count.snags === 0 ? "ncrs" : "snags"}`}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {i._count.snags > 0 ? `${i._count.snags} snag${i._count.snags === 1 ? "" : "s"}` : ""}
                    {i._count.snags > 0 && i._count.ncrs > 0 ? " · " : ""}
                    {i._count.ncrs > 0 ? `${i._count.ncrs} NCR${i._count.ncrs === 1 ? "" : "s"}` : ""}
                  </Link>
                )}

                {i.certificate && (
                  <a href={i.certificate.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                    Certificate <ExternalLink className="size-3" />
                  </a>
                )}

                {canManage && (
                  <div className="ml-auto flex items-center gap-1.5">
                    {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    {(i.status === "SCHEDULED" || i.status === "BOOKED" || i.status === "OVERDUE") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-0.5 px-1.5 text-[11px] text-muted-foreground"
                        disabled={pending}
                        title="Reschedule to a date, or re-attach to a job"
                        onClick={() => setMove(i)}
                      >
                        <CalendarRange className="size-3" /> Move
                      </Button>
                    )}
                    {(i.status === "SCHEDULED" || i.status === "OVERDUE") && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => setBook(i)}>Book</Button>
                    )}
                    {i.status !== "PASSED" && i.status !== "FAILED" && (
                      <>
                        <Button size="sm" disabled={pending} onClick={() => setDialog({ kind: "pass", insp: i })}>Pass</Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog({ kind: "fail", insp: i })}>Fail</Button>
                      </>
                    )}
                    {i.status === "FAILED" && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => action.reinspect(i.id)}>Re-inspect</Button>
                    )}
                    {i.status !== "PASSED" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setNotify(i)} title="Notify a contractor via Contractor Comms">Notify</Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <SignOffDialog
          kind={dialog.kind}
          insp={dialog.insp}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refetch(); }}
        />
      )}
      {notify && <NotifyContractorDialog insp={notify} onClose={() => setNotify(null)} />}
      {move && (
        <MoveDialog
          insp={move}
          onClose={() => setMove(null)}
          onDone={() => { setMove(null); void refetch(); }}
        />
      )}
      {book && (
        <BookDialog
          insp={book}
          onClose={() => setBook(null)}
          onDone={() => { setBook(null); void refetch(); }}
        />
      )}
    </div>
  );
}

// ---- Book dialog: confirm the inspector's visit date (D8) ----
function BookDialog({ insp, onClose, onDone }: { insp: Insp; onClose: () => void; onDone: () => void }) {
  const action = useInspectionAction({ silent: false });
  const [date, setDate] = useState(() => format(new Date(insp.scheduledDate), "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) return;
    setBusy(true);
    try {
      const r = await action.book(insp.id, date);
      if (r.ok) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Book — {insp.name}</DialogTitle></DialogHeader>
        <div className="space-y-1 py-2">
          <Label>Visit date</Label>
          <Input
            type="date"
            value={date}
            autoFocus
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && date && !busy) void submit(); }}
          />
          <p className="text-[11px] text-muted-foreground">
            The day the inspector is visiting — defaults to the scheduled date.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !date}>
            {busy && <Loader2 className="size-4 animate-spin" />} Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Move dialog: reschedule to a date OR re-attach to a job (S17) ----
function MoveDialog({ insp, onClose, onDone }: { insp: Insp; onClose: () => void; onDone: () => void }) {
  const action = useInspectionAction({ silent: false });
  const [mode, setMode] = useState<"date" | "anchor">("date");
  const [date, setDate] = useState("");
  const [jobs, setJobs] = useState<Array<{ id: string; name: string }>>([]);
  const [jobId, setJobId] = useState(insp.anchorJobId ?? "");
  const [edge, setEdge] = useState<"START" | "END">("END");
  const [offset, setOffset] = useState("0");
  const [busy, setBusy] = useState(false);

  // Leaf jobs on this plot (parents are aggregates — not real anchors).
  useEffect(() => {
    fetch(`/api/plots/${insp.plot.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p?.jobs) return;
        const all = p.jobs as Array<{ id: string; name: string; parentId?: string | null }>;
        const parentIds = new Set(all.map((j) => j.parentId).filter(Boolean));
        setJobs(all.filter((j) => !parentIds.has(j.id)).map((j) => ({ id: j.id, name: j.name })));
      })
      .catch(() => {});
  }, [insp.plot.id]);

  async function submit() {
    setBusy(true);
    try {
      const r =
        mode === "date"
          ? await action.reschedule(insp.id, date)
          : await action.patch(insp.id, { anchorJobId: jobId, anchorEdge: edge, offsetDays: Math.trunc(Number(offset) || 0) });
      if (r.ok) onDone();
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode === "date" ? !!date : !!jobId;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Move — {insp.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("date")}
              className={`rounded-full border px-3 py-1 text-xs ${mode === "date" ? "border-amber-500 bg-amber-50 font-medium text-amber-700" : "border-input text-muted-foreground"}`}
            >
              Pick a date
            </button>
            <button
              onClick={() => setMode("anchor")}
              className={`rounded-full border px-3 py-1 text-xs ${mode === "anchor" ? "border-amber-500 bg-amber-50 font-medium text-amber-700" : "border-input text-muted-foreground"}`}
            >
              Attach to a job
            </button>
          </div>
          {mode === "date" ? (
            <div>
              <Label>New date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                A fixed date detaches the inspection from its anchor job — it will no longer move when the programme moves.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <Label>Anchor job (this plot)</Label>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="">Select a job…</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Edge</Label>
                  <select value={edge} onChange={(e) => setEdge(e.target.value === "START" ? "START" : "END")} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                    <option value="END">After it finishes</option>
                    <option value="START">When it starts</option>
                  </select>
                </div>
                <div className="w-28">
                  <Label>Offset (days)</Label>
                  <Input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The date re-derives from the job and follows it automatically when the programme moves.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy && <Loader2 className="size-4 animate-spin" />} Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Notify a contractor about an inspection (via Contractor Comms) ----
function NotifyContractorDialog({ insp, onClose }: { insp: Insp; onClose: () => void }) {
  const toast = useToast();
  // (Jun 2026 D7) Carry email so contractors without one are flagged
  // "(no email)" and the send is blocked — the notification IS an email.
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; company: string | null; email: string | null }>>([]);
  const [contactId, setContactId] = useState("");
  const [message, setMessage] = useState(
    `${inspectionTypeLabel(insp.type)} inspection "${insp.name}" is scheduled for ${format(new Date(insp.scheduledDate), "EEE d MMM")} on Plot ${insp.plot.plotNumber ?? insp.plot.name}. Please make sure the area is ready and accessible.`,
  );
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/contacts?type=CONTRACTOR`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all) => setContacts((Array.isArray(all) ? all : []).map((c: { id: string; name: string; company: string | null; email: string | null }) => ({ id: c.id, name: c.name, company: c.company, email: c.email }))))
      .catch(() => {});
  }, []);

  const selectedContact = contacts.find((c) => c.id === contactId);
  const noEmail = !!selectedContact && !selectedContact.email;

  async function send() {
    if (!contactId || noEmail) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sites/${insp.plot.siteId}/toolbox-talks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: `Inspection: ${insp.name} — Plot ${insp.plot.plotNumber ?? insp.plot.name}`,
          notes: message.trim(),
          contractorIds: [contactId],
          mode: "request",
          dueBy: insp.scheduledDate,
          sendEmail: true,
        }),
      });
      if (r.ok) {
        setSent(true);
        setTimeout(onClose, 1200);
      } else {
        toast.error(await fetchErrorMessage(r, "Failed to notify contractor"));
      }
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Notify a contractor — {insp.name}</DialogTitle></DialogHeader>
        {sent ? (
          <p className="py-4 text-center text-sm text-emerald-600">Sent to Contractor Comms ✓</p>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label>Contractor</Label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">Select a contractor…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}{c.email ? "" : " (no email)"}</option>)}
              </select>
              {noEmail && (
                <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  No email on file — this contractor can&apos;t be notified. Add an email in Contacts first.
                </p>
              )}
            </div>
            <div>
              <Label>Message</Label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm" />
              <p className="mt-1 text-[11px] text-muted-foreground">Creates a Contractor Comms entry (due by the inspection date) and emails the contractor.</p>
            </div>
          </div>
        )}
        {!sent && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !contactId || noEmail} onClick={send}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Send"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Pass / Fail sign-off dialog with findings ----
function SignOffDialog({ kind, insp, onClose, onDone }: { kind: "pass" | "fail"; insp: Insp; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const action = useInspectionAction({ silent: false });
  const [certId, setCertId] = useState(insp.certificateDocumentId ?? "");
  const [tickHandover, setTickHandover] = useState(true);
  const [findings, setFindings] = useState<InspectionFinding[]>([]);
  const [busy, setBusy] = useState(false);
  // (Jun 2026 Keith SSoT-flows report) The quick rows below are for speed;
  // the FULL snag form (photos, location, assignee — the same SnagDialog
  // used everywhere else) opens from here, creating the snag immediately
  // and already linked to this inspection via inspectionId.
  const [fullSnagOpen, setFullSnagOpen] = useState(false);
  const [fullSnagsRaised, setFullSnagsRaised] = useState(0);
  // (Jun 2026) Certificate picker — list this plot's documents so the
  // manager SELECTS the cert instead of pasting an opaque ID, or uploads
  // one inline (posted to the plot with category CERT so it lands in the
  // handover folder). Replaces the old dead-end paste-ID flow.
  const [docs, setDocs] = useState<Array<{ id: string; name: string; category: string | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // (Jun 2026 Q11) Optional per-finding contractor override. Unset =
  // server defaults to the anchor job's contractor — logging a fail is
  // the busy moment, so the picker is never required.
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  useEffect(() => {
    fetch(`/api/contacts?type=CONTRACTOR`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all) => setContacts((Array.isArray(all) ? all : []).map((c: ContactOpt) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
  }, []);
  const loadDocs = useCallback(async () => {
    const r = await fetch(`/api/sites/${insp.plot.siteId}/documents?plotId=${insp.plot.id}`);
    if (r.ok) {
      const all: Array<{ id: string; name: string; category: string | null }> = await r.json();
      // (Jun 2026 W5) Certificates first — the pass flow is nearly always
      // picking a CERT doc, so don't bury them under drawings. Stable sort
      // keeps the server order within each group.
      all.sort((a, b) => Number(b.category === "CERT") - Number(a.category === "CERT"));
      setDocs(all);
    }
  }, [insp.plot.siteId, insp.plot.id]);
  useEffect(() => { if (kind === "pass") void loadDocs(); }, [kind, loadDocs]);
  async function uploadCert(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("plotId", insp.plot.id);
      fd.append("category", "CERT");
      const r = await fetch(`/api/sites/${insp.plot.siteId}/documents`, { method: "POST", body: fd });
      if (r.ok) {
        const created = await r.json().catch(() => null);
        await loadDocs();
        if (created?.id) setCertId(created.id);
      } else {
        toast.error(await fetchErrorMessage(r, "Certificate upload failed"));
      }
    } finally { setUploading(false); }
  }

  const addFinding = () => setFindings((f) => [...f, { kind: "SNAG", description: "", severity: "MEDIUM" }]);
  const setFinding = (idx: number, patch: Partial<InspectionFinding>) =>
    setFindings((f) => f.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const removeFinding = (idx: number) => setFindings((f) => f.filter((_, i) => i !== idx));

  async function submit() {
    setBusy(true);
    const valid = findings.filter((f) => f.description.trim());
    const r =
      kind === "pass"
        ? await action.pass(insp.id, { certificateDocumentId: certId || undefined, tickHandover, findings: valid })
        : await action.fail(insp.id, { findings: valid });
    setBusy(false);
    if (r.ok) onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{kind === "pass" ? "Pass" : "Fail"} — {insp.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {kind === "pass" && (
            <>
              <div>
                <Label>Certificate (required to pass)</Label>
                <div className="flex items-center gap-2">
                  <select
                    value={certId}
                    onChange={(e) => setCertId(e.target.value)}
                    className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">Select the signed certificate…</option>
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.category ? ` (${d.category})` : ""}</option>
                    ))}
                  </select>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCert(f); e.target.value = ""; }}
                  />
                  <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : "Upload"}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Pick an existing plot document or upload one now — it&apos;s filed against this plot so it lands in the handover pack. Passing without a certificate is blocked.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tickHandover} onChange={(e) => setTickHandover(e.target.checked)} />
                Also tick the matching handover certificate item
              </label>
            </>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Findings (optional)</Label>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setFullSnagOpen(true)} title="Open the full snag form — photos, location, assignee">
                  <Camera className="size-3.5" /> Snag + photos
                </Button>
                <Button size="sm" variant="outline" onClick={addFinding}><Plus className="size-3.5" /> Quick finding</Button>
              </div>
            </div>
            {fullSnagsRaised > 0 && (
              <p className="mb-1 text-[11px] text-emerald-700">
                {fullSnagsRaised} snag{fullSnagsRaised === 1 ? "" : "s"} raised with the full form — already linked to this inspection.
              </p>
            )}
            {findings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No findings. Use <strong>Snag + photos</strong> for the full snag form, or add quick text-only findings — each becomes a snag or NCR for the responsible contractor.</p>
            ) : (
              <div className="space-y-2">
                {findings.map((f, idx) => (
                  <div key={idx} className="space-y-1.5 rounded border p-2">
                    <div className="flex items-start gap-2">
                      <select value={f.kind} onChange={(e) => setFinding(idx, { kind: e.target.value as "SNAG" | "NCR" })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                        <option value="SNAG">Snag</option>
                        <option value="NCR">NCR</option>
                      </select>
                      <Input value={f.description} onChange={(e) => setFinding(idx, { description: e.target.value })} placeholder="Describe the defect" className="flex-1" />
                      {/* (Jun 2026 D5) Severity is a snag concept — NCRs
                          have a formal lifecycle instead, so hide it. */}
                      {f.kind !== "NCR" && (
                        <select value={f.severity} onChange={(e) => setFinding(idx, { severity: e.target.value as InspectionFinding["severity"] })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      )}
                      <button onClick={() => removeFinding(idx)} className="mt-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                    {/* (Jun 2026 D5) NCR-only formal QA fields — optional,
                        same fields the manual Raise NCR dialog has. */}
                    {f.kind === "NCR" && (
                      <div className="flex gap-2">
                        <Input
                          value={f.rootCause ?? ""}
                          onChange={(e) => setFinding(idx, { rootCause: e.target.value })}
                          placeholder="Root cause (optional)"
                          className="h-8 flex-1 text-xs"
                        />
                        <Input
                          value={f.correctiveAction ?? ""}
                          onChange={(e) => setFinding(idx, { correctiveAction: e.target.value })}
                          placeholder="Corrective action (optional)"
                          className="h-8 flex-1 text-xs"
                        />
                      </div>
                    )}
                    <select
                      value={f.contactId ?? ""}
                      onChange={(e) => setFinding(idx, { contactId: e.target.value || undefined })}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-muted-foreground"
                      title="Who is responsible for fixing this"
                    >
                      <option value="">Contractor: anchor job&apos;s contractor (default)</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* (Jun 2026 W4) The server hard-rejects a pass without a cert —
            disable Confirm up-front instead of letting the click bounce. */}
        {kind === "pass" && !certId && (
          <p className="text-[11px] text-amber-700">Select or upload the signed certificate above to enable Confirm pass.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (kind === "pass" && !certId)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {kind === "pass" ? "Confirm pass" : "Confirm fail"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {/* The ONE TRUE snag form (photos, location, assignee) — creates the
          snag immediately, linked to this inspection via inspectionId. */}
      {fullSnagOpen && (
        <SnagDialog
          open={fullSnagOpen}
          onOpenChange={setFullSnagOpen}
          plotId={insp.plot.id}
          initialJobId={insp.anchorJobId ?? undefined}
          inspectionId={insp.id}
          onSaved={() => setFullSnagsRaised((n) => n + 1)}
        />
      )}
    </Dialog>
  );
}
