import { prisma } from "@/lib/prisma";
import { verifyShareToken } from "@/lib/share-token";
import { format } from "date-fns";
import { CheckCircle2, Clock, AlertCircle, PauseCircle, Building2, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  NOT_STARTED: { label: "Not Started", color: "text-slate-500 bg-slate-50 border-slate-200", Icon: Clock },
  IN_PROGRESS: { label: "In Progress", color: "text-blue-700 bg-blue-50 border-blue-200", Icon: Clock },
  COMPLETED: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200", Icon: CheckCircle2 },
  ON_HOLD: { label: "On Hold", color: "text-amber-700 bg-amber-50 border-amber-200", Icon: PauseCircle },
};

function fmt(d: Date | string | null): string {
  if (!d) return "—";
  return format(new Date(d), "dd MMM yyyy");
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const payload = verifyShareToken(token);
  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-800">Link Expired or Invalid</h1>
          <p className="mt-2 text-sm text-slate-500">
            This sharing link has expired or is not valid. Please ask the site manager to generate a new link.
          </p>
        </div>
      </div>
    );
  }

  const plot = await prisma.plot.findUnique({
    where: { id: payload.plotId },
    select: {
      id: true,
      name: true,
      plotNumber: true,
      houseType: true,
      description: true,
      site: { select: { id: true, name: true, location: true } },
      jobs: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          stageCode: true,
          location: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
  });

  if (!plot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-800">Plot Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">This plot no longer exists.</p>
        </div>
      </div>
    );
  }

  const completedJobs = plot.jobs.filter((j) => j.status === "COMPLETED").length;
  const totalJobs = plot.jobs.length;
  const progressPct = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <Building2 className="size-6 shrink-0 text-blue-600" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{plot.site.name}</p>
              <h1 className="text-lg font-bold text-slate-900">
                {plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name}
                {plot.plotNumber && plot.name !== `Plot ${plot.plotNumber}` && (
                  <span className="ml-2 text-sm font-normal text-slate-500">— {plot.name}</span>
                )}
              </h1>
            </div>
          </div>
          {(plot.site.location || plot.houseType) && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
              {plot.site.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {plot.site.location}
                </span>
              )}
              {plot.houseType && <span>House type: {plot.houseType}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {/* Progress summary */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Build Progress</span>
            <span className="text-sm font-bold text-slate-900">{progressPct}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {completedJobs} of {totalJobs} stages complete
          </p>
        </div>

        {/* Jobs list */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Build Stages</h2>
          </div>
          <div className="divide-y">
            {plot.jobs.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No stages yet</p>
            ) : (
              plot.jobs.map((job) => {
                const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.NOT_STARTED;
                const Icon = cfg.Icon;
                return (
                  <div key={job.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${cfg.color.split(" ")[0]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{job.name}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-slate-400">
                          {job.stageCode && <span>Stage {job.stageCode}</span>}
                          {job.assignedTo && <span>{job.assignedTo.name}</span>}
                          {job.location && <span>{job.location}</span>}
                          {job.status === "COMPLETED" && job.actualEndDate ? (
                            <span>Completed {fmt(job.actualEndDate)}</span>
                          ) : job.status === "IN_PROGRESS" && job.actualStartDate ? (
                            <span>Started {fmt(job.actualStartDate)}</span>
                          ) : job.startDate ? (
                            <span>Scheduled {fmt(job.startDate)}{job.endDate ? ` – ${fmt(job.endDate)}` : ""}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="pb-4 text-center text-[11px] text-slate-400">
          Read-only view · Expires {fmt(new Date(payload.exp))} · Sight Manager
        </p>
      </div>
    </div>
  );
}
