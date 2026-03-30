import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { HardHat, PlayCircle, Clock, AlertTriangle, CheckCircle2, Phone, Mail, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface Job {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  stageCode: string | null;
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

interface ShareData {
  contractor: { id: string; name: string; company: string | null; email: string | null; phone: string | null };
  site: { id: string; name: string; location: string | null };
  expiresAt: string;
  liveJobs: Job[];
  nextJobs: Job[];
  completedJobs: Job[];
  openSnags: Snag[];
}

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(parseISO(d), "dd MMM yyyy");
}

export default async function ContractorSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3002";
  const res = await fetch(`${baseUrl}/api/contractor-share/${token}`, { cache: "no-store" });

  if (!res.ok) {
    notFound();
  }

  const data: ShareData = await res.json();
  const { contractor, site, liveJobs, nextJobs, completedJobs, openSnags, expiresAt } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-blue-600 text-white">
              <HardHat className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{contractor.name}</h1>
              {contractor.company && <p className="text-sm text-muted-foreground">{contractor.company}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-4" />
              <span>{site.name}{site.location ? ` · ${site.location}` : ""}</span>
            </div>
            {contractor.phone && (
              <a href={`tel:${contractor.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Phone className="size-4" /> {contractor.phone}
              </a>
            )}
            {contractor.email && (
              <a href={`mailto:${contractor.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Mail className="size-4" /> {contractor.email}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* Live Jobs */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <PlayCircle className="size-5 text-green-600" />
            <h2 className="font-semibold text-green-700">Active Jobs ({liveJobs.length})</h2>
          </div>
          {liveJobs.length === 0 ? (
            <p className="rounded-lg border bg-white px-4 py-3 text-sm text-muted-foreground">No active jobs right now.</p>
          ) : (
            <div className="space-y-2">
              {liveJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{plotLabel(job.plot)}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Due {fmtDate(job.endDate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Jobs */}
        {nextJobs.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Clock className="size-5 text-blue-500" />
              <h2 className="font-semibold text-blue-700">Upcoming Work ({nextJobs.length})</h2>
            </div>
            <div className="space-y-2">
              {nextJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{plotLabel(job.plot)}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Starts {fmtDate(job.startDate)}</p>
                      <p>Due {fmtDate(job.endDate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Open Snags */}
        {openSnags.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              <h2 className="font-semibold text-orange-700">Open Snags ({openSnags.length})</h2>
            </div>
            <div className="space-y-2">
              {openSnags.map((snag) => (
                <div key={snag.id} className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{snag.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {plotLabel(snag.plot)}{snag.location ? ` · ${snag.location}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLOR[snag.priority] ?? "bg-slate-100 text-slate-600"}`}>
                      {PRIORITY_LABEL[snag.priority] ?? snag.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed Jobs summary */}
        {completedJobs.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-slate-400" />
              <h2 className="font-semibold text-slate-500">Completed ({completedJobs.length})</h2>
            </div>
            <div className="rounded-lg border bg-white px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {completedJobs.map((job) => (
                  <span key={job.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {job.name} · {plotLabel(job.plot)}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground">
          This link is read-only and expires {format(parseISO(expiresAt), "dd MMM yyyy")}.
          Powered by Sight Manager.
        </p>
      </div>
    </div>
  );
}
