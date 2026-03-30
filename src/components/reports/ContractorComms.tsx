"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  Loader2,
  HardHat,
  Briefcase,
  ChevronRight,
  AlertTriangle,
  Phone,
  Mail,
  CheckCircle2,
  PlayCircle,
  Clock,
  Link2,
  Copy,
  Check,
  Printer,
  X,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
}

interface Snag {
  id: string;
  description: string;
  status: string;
  priority: string;
  location: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
}

interface Contractor {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  activePlotCount: number;
  liveJobs: Job[];
  nextJobs: Job[];
  openSnags: Snag[];
}

interface CommsData {
  site: { id: string; name: string };
  contractors: Contractor[];
}

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(parseISO(d), "dd MMM");
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

function ShareDialog({
  siteId,
  contractor,
  onClose,
}: {
  siteId: string;
  contractor: Contractor;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/contractor-comms/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contractor.id, expiryDays }),
      });
      const data = await res.json();
      setUrl(data.url);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Share with {contractor.name}</h3>
            {contractor.company && (
              <p className="text-xs text-muted-foreground">{contractor.company}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Generate a read-only link showing this contractor their live jobs, upcoming work, and open snags. No login required.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Expires after</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="rounded border border-border/60 px-2 py-1 text-sm"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          {!url ? (
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}
              Generate Link
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
                <span className="flex-1 truncate text-xs text-muted-foreground">{url}</span>
                <button
                  onClick={copy}
                  className="shrink-0 rounded p-1 hover:bg-slate-200"
                  title="Copy link"
                >
                  {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {copied ? "Copied!" : "Click the icon to copy. Send this link directly to your contractor."}
              </p>
              <Button variant="outline" onClick={generate} disabled={loading} className="w-full text-xs">
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractorCard({
  contractor,
  siteId,
}: {
  contractor: Contractor;
  siteId: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-white shadow-sm print:break-inside-avoid print:shadow-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <HardHat className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold">{contractor.name}</h3>
            {contractor.company && (
              <p className="text-sm text-muted-foreground">{contractor.company}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-3">
              {contractor.phone && (
                <a href={`tel:${contractor.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Phone className="size-3" /> {contractor.phone}
                </a>
              )}
              {contractor.email && (
                <a href={`mailto:${contractor.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Mail className="size-3" /> {contractor.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="size-3" />
            <span>{contractor.activePlotCount} plot{contractor.activePlotCount !== 1 ? "s" : ""}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Link2 className="mr-1.5 size-3.5" />
            Send Link
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {/* Live Jobs */}
        <div className="px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <PlayCircle className="size-4 text-green-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Live Jobs ({contractor.liveJobs.length})
            </span>
          </div>
          {contractor.liveJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active jobs</p>
          ) : (
            <div className="space-y-1.5">
              {contractor.liveJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{plotLabel(job.plot)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Due {fmtDate(job.endDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Jobs */}
        <div className="px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="size-4 text-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Coming Up ({contractor.nextJobs.length})
            </span>
          </div>
          {contractor.nextJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming jobs</p>
          ) : (
            <div className="space-y-1.5">
              {contractor.nextJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{plotLabel(job.plot)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Starts {fmtDate(job.startDate)}</p>
                    <p>Due {fmtDate(job.endDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Snags */}
        {contractor.openSnags.length > 0 && (
          <div className="px-5 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="size-4 text-orange-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                Open Snags ({contractor.openSnags.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {contractor.openSnags.map((snag) => (
                <div key={snag.id} className="flex items-start justify-between rounded-lg bg-orange-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{snag.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {plotLabel(snag.plot)}{snag.location ? ` · ${snag.location}` : ""}
                    </p>
                  </div>
                  <span className={cn("ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_COLORS[snag.priority] ?? "bg-slate-100 text-slate-600")}>
                    {snag.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <ShareDialog
          siteId={siteId}
          contractor={contractor}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

export function ContractorComms({ siteId }: { siteId: string }) {
  const [data, setData] = useState<CommsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null); // contactId or null = all

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/contractor-comms`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.contractors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HardHat className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No contractors assigned</p>
        <p className="text-xs text-muted-foreground">Assign contractors to jobs to see them here.</p>
      </div>
    );
  }

  const visible = filter ? data.contractors.filter((c) => c.id === filter) : data.contractors;
  const liveCount = data.contractors.filter((c) => c.liveJobs.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !filter
                ? "bg-blue-600 text-white"
                : "border border-border/60 text-muted-foreground hover:border-blue-300 hover:text-blue-700"
            )}
          >
            All ({data.contractors.length})
          </button>
          {data.contractors.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id === filter ? null : c.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === c.id
                  ? "bg-blue-600 text-white"
                  : "border border-border/60 text-muted-foreground hover:border-blue-300 hover:text-blue-700"
              )}
            >
              {c.name}
              {c.liveJobs.length > 0 && (
                <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                  {c.liveJobs.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{liveCount} active</span>
          <span>·</span>
          <span>{data.contractors.length} total</span>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 size-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {visible.map((contractor) => (
          <ContractorCard key={contractor.id} contractor={contractor} siteId={siteId} />
        ))}
      </div>
    </div>
  );
}
