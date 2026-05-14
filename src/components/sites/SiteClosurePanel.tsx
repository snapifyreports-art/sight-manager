"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

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
  }>;
}

export function SiteClosurePanel({ siteId }: { siteId: string }) {
  const toast = useToast();
  const [data, setData] = useState<ClosureSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/story`, {
      cache: "no-store",
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${siteId}/story`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  async function generate() {
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

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
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
  const allReady =
    incompletePlots === 0 && data.variance.snagsOpen === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Package className="size-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Site Closure</h2>
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
        </ul>
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
