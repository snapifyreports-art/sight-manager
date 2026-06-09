"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Trash2, Loader2, ExternalLink, CheckCircle2, XCircle, Clock, CalendarCheck, CalendarClock, ShieldAlert, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HelpTip } from "@/components/shared/HelpTip";
import { useInspectionAction, type InspectionFinding } from "@/hooks/useInspectionAction";
import { inspectionStatusColor, inspectionStatusLabel } from "@/lib/inspection-doctype";

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

/** lucide icon per status, for the pill. */
const STATUS_ICON: Record<string, typeof Clock> = {
  SCHEDULED: Clock,
  BOOKED: CalendarCheck,
  PASSED: CheckCircle2,
  FAILED: XCircle,
  OVERDUE: CalendarClock,
};

/** Date by which a SCHEDULED inspection should be booked (lead window). */
function bookByDate(i: Insp): Date | null {
  if (i.bookingLeadWeeks == null || i.status !== "SCHEDULED") return null;
  const d = new Date(i.scheduledDate);
  d.setDate(d.getDate() - i.bookingLeadWeeks * 7);
  return d;
}

const TYPE_LABEL: Record<string, string> = {
  NHBC: "NHBC", BUILDING_CONTROL: "Building Control", WARRANTY_CML: "Warranty/CML", INTERNAL_QA: "Internal QA", OTHER: "Other",
};
const FILTERS = ["All", "Upcoming", "Overdue", "Passed", "Failed"] as const;
type Filter = (typeof FILTERS)[number];

export function InspectionsClient({ initial, canManage, siteId, embedded }: { initial: Insp[]; canManage: boolean; siteId?: string; embedded?: boolean }) {
  const [items, setItems] = useState<Insp[]>(initial);
  const [filter, setFilter] = useState<Filter>("Upcoming");
  const [dialog, setDialog] = useState<{ kind: "pass" | "fail"; insp: Insp } | null>(null);
  const [notify, setNotify] = useState<Insp | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/inspections${siteId ? `?siteId=${siteId}` : ""}`);
    if (res.ok) setItems(await res.json());
  }, [siteId]);

  // When embedded in a site tab (no server-rendered initial), fetch on mount.
  useEffect(() => {
    if (siteId && initial.length === 0) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const action = useInspectionAction({ onChange: refetch });

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filter === "All") return true;
      if (filter === "Upcoming") return i.status === "SCHEDULED" || i.status === "BOOKED";
      if (filter === "Overdue") return i.status === "OVERDUE";
      if (filter === "Passed") return i.status === "PASSED";
      if (filter === "Failed") return i.status === "FAILED";
      return true;
    });
  }, [items, filter]);

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

      <div className="flex flex-wrap gap-1.5">
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
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No inspections {filter !== "All" ? `(${filter.toLowerCase()})` : "yet"}. They appear here when a plot is created from a
          template that defines inspections, or when you add one from a plot&apos;s Overview tab.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((i) => {
            const overdue = i.status === "OVERDUE";
            const pending = action.isPending(i.id);
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{TYPE_LABEL[i.type] ?? i.type}</span>
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
                  <div className={overdue ? "font-medium text-amber-600" : ""}>{format(new Date(i.scheduledDate), "EEE d MMM yyyy")}</div>
                  <div className="text-xs text-muted-foreground">{i.inspector ? i.inspector.name : "No inspector set"}</div>
                  {(() => {
                    const by = bookByDate(i);
                    return by ? <div className="text-[11px] font-medium text-amber-600">book by {format(by, "d MMM")}</div> : null;
                  })()}
                </div>

                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundColor: inspectionStatusColor(i.status) }}
                >
                  {(() => { const Ic = STATUS_ICON[i.status] ?? Clock; return <Ic className="size-3" />; })()}
                  {inspectionStatusLabel(i.status)}
                </span>

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
                      <label className="inline-flex cursor-pointer items-center gap-0.5 rounded border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40" title="Reschedule to a specific date">
                        <CalendarRange className="size-3" />
                        <input
                          type="date"
                          className="w-0 opacity-0"
                          disabled={pending}
                          onChange={(e) => { if (e.target.value) action.reschedule(i.id, e.target.value); }}
                        />
                        Move
                      </label>
                    )}
                    {(i.status === "SCHEDULED" || i.status === "OVERDUE") && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => action.book(i.id)}>Book</Button>
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
    </div>
  );
}

// ---- Notify a contractor about an inspection (via Contractor Comms) ----
function NotifyContractorDialog({ insp, onClose }: { insp: Insp; onClose: () => void }) {
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [contactId, setContactId] = useState("");
  const [message, setMessage] = useState(
    `${TYPE_LABEL[insp.type] ?? insp.type} inspection "${insp.name}" is scheduled for ${format(new Date(insp.scheduledDate), "EEE d MMM")} on Plot ${insp.plot.plotNumber ?? insp.plot.name}. Please make sure the area is ready and accessible.`,
  );
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/contacts?type=CONTRACTOR`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all) => setContacts((Array.isArray(all) ? all : []).map((c: { id: string; name: string; company: string | null }) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
  }, []);

  async function send() {
    if (!contactId) return;
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
      if (r.ok) { setSent(true); setTimeout(onClose, 1200); }
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
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
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
            <Button disabled={busy || !contactId} onClick={send}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Send"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Pass / Fail sign-off dialog with findings ----
function SignOffDialog({ kind, insp, onClose, onDone }: { kind: "pass" | "fail"; insp: Insp; onClose: () => void; onDone: () => void }) {
  const action = useInspectionAction({ silent: false });
  const [certId, setCertId] = useState(insp.certificateDocumentId ?? "");
  const [tickHandover, setTickHandover] = useState(true);
  const [findings, setFindings] = useState<InspectionFinding[]>([]);
  const [busy, setBusy] = useState(false);
  // (Jun 2026) Certificate picker — list this plot's documents so the
  // manager SELECTS the cert instead of pasting an opaque ID, or uploads
  // one inline (posted to the plot with category CERT so it lands in the
  // handover folder). Replaces the old dead-end paste-ID flow.
  const [docs, setDocs] = useState<Array<{ id: string; name: string; category: string | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const loadDocs = useCallback(async () => {
    const r = await fetch(`/api/sites/${insp.plot.siteId}/documents?plotId=${insp.plot.id}`);
    if (r.ok) setDocs(await r.json());
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
              <Button size="sm" variant="outline" onClick={addFinding}><Plus className="size-3.5" /> Add finding</Button>
            </div>
            {findings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No findings. Add any defects raised at this inspection — each becomes a snag or NCR for the responsible contractor.</p>
            ) : (
              <div className="space-y-2">
                {findings.map((f, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded border p-2">
                    <select value={f.kind} onChange={(e) => setFinding(idx, { kind: e.target.value as "SNAG" | "NCR" })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                      <option value="SNAG">Snag</option>
                      <option value="NCR">NCR</option>
                    </select>
                    <Input value={f.description} onChange={(e) => setFinding(idx, { description: e.target.value })} placeholder="Describe the defect" className="flex-1" />
                    <select value={f.severity} onChange={(e) => setFinding(idx, { severity: e.target.value as InspectionFinding["severity"] })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                    <button onClick={() => removeFinding(idx)} className="mt-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {kind === "pass" ? "Confirm pass" : "Confirm fail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
