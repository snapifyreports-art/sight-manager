"use client";

import { useEffect, useState, useCallback } from "react";
import { HelpTip } from "@/components/shared/HelpTip";
import {
  Loader2,
  Package,
  Download,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Hammer,
  HardHat,
  Truck,
  FileText,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

/**
 * Site Closure tab — generates the end-of-site Handover ZIP.
 *
 * Shows a readiness checklist (any plots not COMPLETED? any open
 * snags?), the big "Generate Handover ZIP" button, and a status block
 * with what's currently inside the bundle.
 */

interface ClosureSummary {
  site: {
    id: string;
    name: string;
    status: string;
    completedAt: string | null;
  };
  overview: {
    plotCount: number;
    plotsCompleted: number;
    plotsInProgress: number;
    plotsNotStarted: number;
  };
  variance: {
    snagsRaised: number;
    snagsOpen: number;
  };
  contractorPerformance: Array<{ contactId: string }>;
  plotStories: Array<{
    id: string;
    plotNumber: string | null;
    photoCount: number;
    journalEntryCount: number;
    snagCount: number;
    // (R9) Signals for the "nothing recorded" advisory. Optional so an
    // older cached story payload doesn't break the panel.
    preStartTotal?: number;
    inspectionTotal?: number;
    handoverItemsTotal?: number;
  }>;
  // (May 2026 Closure-deepening) Compliance + readiness + toolbox
  // counts from the Story SSoT — Closure used to gate only on
  // incomplete plots + open snags. Now every category that affects
  // handover readiness flows through here so a manager can't ship
  // the ZIP while NCRs, defects, variations, handover docs, pre-
  // start checks or outstanding toolbox talks are unresolved.
  compliance?: {
    ncrs: { total: number; open: number; closed: number };
    defects: { total: number; open: number; resolved: number };
    /** (Jun 2026 audit) `rejected` is optional for old cached payloads —
     *  REJECTED variations are finalised, so the gate below subtracts
     *  them instead of counting them as outstanding forever. */
    variations: { total: number; approved: number; rejected?: number };
  };
  evidence?: {
    preStartChecks: { total: number; checked: number };
  };
  handoverReadiness?: {
    requiredTotal: number;
    requiredChecked: number;
  };
  // (Jun 2026 Inspections) Open (SCHEDULED/BOOKED/OVERDUE) or FAILED
  // hold-points block a clean handover — every statutory/QA inspection
  // must be PASSED before the site is ready to close.
  inspections?: {
    total: number;
    passed: number;
    failed: number;
    open: number;
    overdue: number;
    /** (Jun 2026 Q6/S13) PASSED but no certificate attached. */
    certMissing?: number;
  };
  toolboxTalks?: {
    total: number;
    requested: number;
    completed: number;
  };
  overdueNow?: {
    count: number;
  };
}

export function SiteClosurePanel({ siteId }: { siteId: string }) {
  const toast = useToast();
  // (R8) Confirm gate for generating the ZIP while readiness items are
  // still outstanding. The dialog is mounted on EVERY return path below
  // so the promise can resolve regardless of which branch is rendered.
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [data, setData] = useState<ClosureSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // (Jun 2026 audit) Pre-fix a failed story fetch left loading=false +
  // data=null — an infinite spinner with no message. Now an inline
  // error card with Retry (wired to `refresh`, previously dead code).
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/story`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(await fetchErrorMessage(res));
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/sites/${siteId}/story`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(await fetchErrorMessage(r));
          return;
        }
        const d = await r.json();
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled)
          setError("Network error — check your connection and try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  async function generate() {
    // (R8) When readiness gates are still outstanding, confirm before
    // building the bundle — warn, never block. The ZIP is always a
    // snapshot of current state, so a manager can deliberately ship it
    // early; this just makes that a conscious choice.
    if (data) {
      const outstanding = countOutstandingItems(data);
      if (outstanding > 0) {
        const ok = await confirm({
          title: `${outstanding} item${outstanding !== 1 ? "s" : ""} outstanding — generate anyway?`,
          body: "The handover ZIP will reflect the current state, including anything not yet complete. You can regenerate it later once the outstanding items are cleared.",
          confirmLabel: "Generate anyway",
          danger: true,
        });
        if (!ok) return;
      }
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/handover-zip`, {
        method: "POST",
      });
      if (!res.ok) {
        const msg = await fetchErrorMessage(res);
        toast.error(`Couldn't generate handover ZIP — ${msg}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m?.[1] ?? `SiteHandover_${siteId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Handover ZIP downloaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate ZIP",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
        {confirmDialog}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 py-12 text-center">
        <AlertTriangle className="size-6 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-slate-800">
            Couldn&apos;t load the closure summary
          </p>
          {error && <p className="mt-0.5 text-xs text-slate-500">{error}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          Try again
        </Button>
        {confirmDialog}
      </div>
    );
  }

  const incompletePlots =
    data.overview.plotsInProgress + data.overview.plotsNotStarted;
  const totalPhotos = data.plotStories.reduce(
    (sum, p) => sum + p.photoCount,
    0,
  );
  const totalJournals = data.plotStories.reduce(
    (sum, p) => sum + p.journalEntryCount,
    0,
  );
  // (May 2026 Closure-deepening) Pull out the new readiness signals.
  // Each falls back gracefully when the Story payload doesn't carry
  // the field (old caches / staging environments).
  const openNcrs = data.compliance?.ncrs.open ?? 0;
  const openDefects = data.compliance?.defects.open ?? 0;
  // (Jun 2026 audit) Outstanding = not yet finalised. APPROVED /
  // IMPLEMENTED and REJECTED are all terminal — pre-fix a single
  // rejected variation blocked "ready" forever, contradicting the
  // row's own "approved or rejected" label.
  const variationsOutstanding =
    data.compliance?.variations
      ? data.compliance.variations.total -
        data.compliance.variations.approved -
        (data.compliance.variations.rejected ?? 0)
      : 0;
  const handoverDocsRequired = data.handoverReadiness?.requiredTotal ?? 0;
  const handoverDocsSigned = data.handoverReadiness?.requiredChecked ?? 0;
  const handoverDocsReady =
    handoverDocsRequired === 0 || handoverDocsSigned === handoverDocsRequired;
  const preStartRequired = data.evidence?.preStartChecks.total ?? 0;
  const preStartChecked = data.evidence?.preStartChecks.checked ?? 0;
  const preStartReady =
    preStartRequired === 0 || preStartChecked === preStartRequired;
  const toolboxOutstanding = data.toolboxTalks?.requested ?? 0;
  const overdueNow = data.overdueNow?.count ?? 0;
  const inspectionsOpen = data.inspections?.open ?? 0;
  const inspectionsFailed = data.inspections?.failed ?? 0;
  const inspectionsUnresolved = inspectionsOpen + inspectionsFailed;
  const inspectionsReady =
    (data.inspections?.total ?? 0) === 0 || inspectionsUnresolved === 0;
  const allReady =
    incompletePlots === 0 &&
    data.variance.snagsOpen === 0 &&
    openNcrs === 0 &&
    openDefects === 0 &&
    variationsOutstanding === 0 &&
    handoverDocsReady &&
    preStartReady &&
    inspectionsReady &&
    toolboxOutstanding === 0 &&
    overdueNow === 0;

  // (R9) Plots where the checklists were never set up: no handover
  // checklist items AND no pre-start checks AND no inspections. Derived
  // from the story payload's per-plot counters. Distinct from "items
  // outstanding" — this flags plots that have nothing recorded at all,
  // which usually means a setup step was skipped rather than work missed.
  const plotsNothingRecorded = data.plotStories.filter(
    (p) =>
      (p.handoverItemsTotal ?? 0) === 0 &&
      (p.preStartTotal ?? 0) === 0 &&
      (p.inspectionTotal ?? 0) === 0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Package className="size-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Site Closure</h2>
          <HelpTip title="Closure readiness" anchor="below-left">
            Checks the site is genuinely ready to hand over: every plot
            complete, snags/NCRs/defects cleared, inspections passed with
            certificates filed, and compliance docs in date. Anything still
            outstanding is listed below so you can clear it before generating
            the handover pack.
          </HelpTip>
          {data.site.status === "COMPLETED" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              Closed
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate the internal handover ZIP — per-plot folders with every
          document, photo, and story, plus contractor / supplier / cost
          analysis. The bundle assembles live from existing data; no
          separate prep needed.
        </p>
      </div>

      {/* Readiness checklist */}
      <section className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Readiness checklist
        </h3>
        <ul className="space-y-2 text-sm">
          <ChecklistRow
            ok={incompletePlots === 0}
            okLabel={`All ${data.overview.plotCount} plots complete`}
            warnLabel={`${incompletePlots} plot${incompletePlots !== 1 ? "s" : ""} still in progress or not started — you can still generate but the ZIP will reflect the current state`}
          />
          <ChecklistRow
            ok={data.variance.snagsOpen === 0}
            okLabel="No open snags"
            warnLabel={`${data.variance.snagsOpen} open snag${data.variance.snagsOpen !== 1 ? "s" : ""} will be flagged in the snag log`}
          />
          <ChecklistRow
            ok={data.site.status === "COMPLETED"}
            okLabel="Site marked as Completed"
            warnLabel="Site is still active — generating now will produce a snapshot of today's state"
          />
          {/* (May 2026 Closure-deepening) Compliance gates — only
              render when the Story payload carries them so older
              caches don't show false negatives. */}
          {data.compliance && (
            <>
              <ChecklistRow
                ok={openNcrs === 0}
                okLabel="No open NCRs"
                warnLabel={`${openNcrs} non-conformance${openNcrs !== 1 ? "s" : ""} still open — buyer pack will flag these`}
              />
              <ChecklistRow
                ok={openDefects === 0}
                okLabel="No open warranty defects"
                warnLabel={`${openDefects} defect report${openDefects !== 1 ? "s" : ""} unresolved`}
              />
              <ChecklistRow
                ok={variationsOutstanding === 0}
                okLabel="All variations approved or rejected"
                warnLabel={`${variationsOutstanding} variation${variationsOutstanding !== 1 ? "s" : ""} still awaiting a decision`}
              />
            </>
          )}
          {data.handoverReadiness && handoverDocsRequired > 0 && (
            <ChecklistRow
              ok={handoverDocsReady}
              okLabel={`All ${handoverDocsRequired} required handover documents signed off`}
              warnLabel={`${handoverDocsRequired - handoverDocsSigned} of ${handoverDocsRequired} handover documents still unsigned (EPC / gas-safe / electrical / NHBC etc.)`}
            />
          )}
          {data.inspections && data.inspections.total > 0 && (
            <ChecklistRow
              ok={inspectionsReady}
              okLabel={`All ${data.inspections.total} inspections passed`}
              warnLabel={`${inspectionsUnresolved} inspection${inspectionsUnresolved !== 1 ? "s" : ""} not passed${inspectionsFailed > 0 ? ` (${inspectionsFailed} failed)` : ""}${inspectionsOpen > 0 ? ` (${inspectionsOpen} still open)` : ""} — NHBC / Building Control / warranty holds must clear before handover`}
            />
          )}
          {/* (Jun 2026 Q6 + S13) Passed-without-certificate — the ZIP still
              builds (warn, never block) but the evidence gap is called out
              here AND in the bundle's 00_WARNINGS.txt. */}
          {(data.inspections?.certMissing ?? 0) > 0 && (
            <ChecklistRow
              ok={false}
              okLabel=""
              warnLabel={`${data.inspections!.certMissing} passed inspection${data.inspections!.certMissing !== 1 ? "s" : ""} have no certificate attached — their evidence will be missing from the buyer pack (the ZIP will include a 00_WARNINGS.txt)`}
            />
          )}
          {data.evidence && preStartRequired > 0 && (
            <ChecklistRow
              ok={preStartReady}
              okLabel={`All ${preStartRequired} pre-start checks complete`}
              warnLabel={`${preStartRequired - preStartChecked} of ${preStartRequired} pre-start checks outstanding`}
            />
          )}
          {data.toolboxTalks && (
            <ChecklistRow
              ok={toolboxOutstanding === 0}
              okLabel="No outstanding toolbox talks"
              warnLabel={`${toolboxOutstanding} toolbox talk${toolboxOutstanding !== 1 ? "s" : ""} requested but not yet delivered`}
            />
          )}
          {data.overdueNow && (
            <ChecklistRow
              ok={overdueNow === 0}
              okLabel="No jobs past their original planned end"
              warnLabel={`${overdueNow} job${overdueNow !== 1 ? "s" : ""} currently overdue against the immutable baseline`}
            />
          )}
        </ul>

        {/* (R9) Plots with nothing recorded — checklists never set up.
            Amber advisory, never a blocker; sits under the readiness
            checklist so the manager spots a skipped setup step. */}
        {plotsNothingRecorded.length > 0 && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            {plotsNothingRecorded.map((p) => (
              <p
                key={p.id}
                className="flex items-start gap-2 text-sm text-amber-800"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  Nothing recorded on Plot {p.plotNumber ?? "?"} — checklists
                  were never set up
                </span>
              </p>
            ))}
          </div>
        )}
      </section>

      {/* What's in the bundle */}
      <section className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          What goes in the ZIP
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            icon={Building2}
            label="Plots"
            value={String(data.overview.plotCount)}
            sub="one folder each — docs, photos, story"
          />
          <SummaryCard
            icon={FileText}
            label="Photos"
            value={String(totalPhotos)}
            sub="organised per plot, per stage"
          />
          <SummaryCard
            icon={Hammer}
            label="Story entries"
            value={String(totalJournals)}
            sub="journal updates across all plots"
          />
          <SummaryCard
            icon={HardHat}
            label="Contractors"
            value={String(data.contractorPerformance.length)}
            sub="performance summary + per-contractor PDFs"
          />
          <SummaryCard
            icon={Truck}
            label="Snag log"
            value={String(data.variance.snagsRaised)}
            sub={`${data.variance.snagsOpen} still open`}
          />
          {data.inspections && data.inspections.total > 0 && (
            <SummaryCard
              icon={ClipboardCheck}
              label="Inspections"
              value={`${data.inspections.passed}/${data.inspections.total}`}
              sub={`${Math.round((data.inspections.passed / data.inspections.total) * 100)}% passed · ${inspectionsUnresolved} outstanding${(data.inspections.certMissing ?? 0) > 0 ? ` · ${data.inspections.certMissing} cert${data.inspections.certMissing !== 1 ? "s" : ""} missing` : ""}`}
            />
          )}
        </div>
      </section>

      {/* Generate button */}
      <section className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">
              Generate Handover ZIP
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {allReady
                ? "Site is ready to hand over."
                : "Site has open work — you can still generate a snapshot."}
            </p>
          </div>
          <Button
            onClick={generate}
            disabled={generating}
            size="lg"
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {generating ? "Building ZIP…" : "Download Handover ZIP"}
          </Button>
        </div>
      </section>
      {/* (R8) Mounted on the main path — the outstanding-items confirm
          gate lives here. Loading + error paths mount their own copy. */}
      {confirmDialog}
    </div>
  );
}

function ChecklistRow({
  ok,
  okLabel,
  warnLabel,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <span className={ok ? "text-slate-700" : "text-amber-800"}>
        {ok ? okLabel : warnLabel}
      </span>
    </li>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * (R8) Total outstanding readiness items, mirroring the `allReady`
 * gates rendered in the readiness checklist. Used only to phrase the
 * "X items outstanding — generate anyway?" confirm; it never blocks.
 */
function countOutstandingItems(data: ClosureSummary): number {
  const incompletePlots =
    data.overview.plotsInProgress + data.overview.plotsNotStarted;
  const variationsOutstanding = data.compliance?.variations
    ? data.compliance.variations.total -
      data.compliance.variations.approved -
      (data.compliance.variations.rejected ?? 0)
    : 0;
  const handoverDocsRequired = data.handoverReadiness?.requiredTotal ?? 0;
  const handoverDocsSigned = data.handoverReadiness?.requiredChecked ?? 0;
  const handoverDocsOutstanding =
    handoverDocsRequired > 0 ? handoverDocsRequired - handoverDocsSigned : 0;
  const preStartRequired = data.evidence?.preStartChecks.total ?? 0;
  const preStartChecked = data.evidence?.preStartChecks.checked ?? 0;
  const preStartOutstanding =
    preStartRequired > 0 ? preStartRequired - preStartChecked : 0;
  const inspectionsUnresolved =
    (data.inspections?.open ?? 0) + (data.inspections?.failed ?? 0);

  return (
    incompletePlots +
    data.variance.snagsOpen +
    (data.compliance?.ncrs.open ?? 0) +
    (data.compliance?.defects.open ?? 0) +
    variationsOutstanding +
    handoverDocsOutstanding +
    preStartOutstanding +
    inspectionsUnresolved +
    (data.toolboxTalks?.requested ?? 0) +
    (data.overdueNow?.count ?? 0)
  );
}
