import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { Building2, AlertTriangle, CheckCircle, Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio | Sight Manager",
};

/**
 * (May 2026 audit #181) Portfolio dashboard — cross-site overview for
 * execs. Shows every accessible site with:
 *   - progress %
 *   - active job + open snag counts
 *   - overdue + stale-snag counts (the At-Risk inputs)
 *   - status pill
 *
 * Distinct from /dashboard which is operator-focused (today's tasks,
 * recent events). Portfolio is the strategic 30,000ft view.
 */
export default async function PortfolioPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const where = siteIds !== null ? { id: { in: siteIds } } : {};

  const sites = await prisma.site.findMany({
    where,
    select: {
      id: true,
      name: true,
      location: true,
      status: true,
      createdAt: true,
      _count: { select: { plots: true } },
      plots: {
        select: {
          buildCompletePercent: true,
          jobs: {
            where: { children: { none: {} } },
            select: { status: true, endDate: true, actualEndDate: true },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  const cards = await Promise.all(
    sites.map(async (s) => {
      // Average build percent across plots.
      const avgProgress =
        s.plots.length > 0
          ? Math.round(
              s.plots.reduce((sum, p) => sum + (p.buildCompletePercent ?? 0), 0) /
                s.plots.length,
            )
          : 0;
      const allJobs = s.plots.flatMap((p) => p.jobs);
      const inProgress = allJobs.filter((j) => j.status === "IN_PROGRESS").length;
      const overdue = allJobs.filter(
        (j) =>
          j.endDate && j.endDate.getTime() < now.getTime() && j.status !== "COMPLETED",
      ).length;

      const staleSnags = await prisma.snag.count({
        where: {
          plot: { siteId: s.id },
          status: { in: ["OPEN", "IN_PROGRESS"] },
          createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      const openSnags = await prisma.snag.count({
        where: {
          plot: { siteId: s.id },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });

      return {
        id: s.id,
        name: s.name,
        location: s.location,
        status: s.status,
        plots: s._count.plots,
        avgProgress,
        inProgress,
        overdue,
        openSnags,
        staleSnags,
      };
    }),
  );

  const totals = {
    plots: cards.reduce((s, c) => s + c.plots, 0),
    inProgress: cards.reduce((s, c) => s + c.inProgress, 0),
    overdue: cards.reduce((s, c) => s + c.overdue, 0),
    openSnags: cards.reduce((s, c) => s + c.openSnags, 0),
    staleSnags: cards.reduce((s, c) => s + c.staleSnags, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cross-site view across every site you can access.
        </p>
      </div>

      {/* Tenant-wide totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active sites" value={cards.filter((c) => c.status === "ACTIVE").length} icon={Activity} colour="text-blue-600" />
        <Stat label="Total plots" value={totals.plots} icon={Building2} colour="text-slate-600" />
        <Stat label="Overdue jobs" value={totals.overdue} icon={AlertTriangle} colour="text-red-600" />
        <Stat label="Stale snags" value={totals.staleSnags} icon={CheckCircle} colour="text-amber-600" />
      </div>

      {/* Per-site grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.id}
            href={`/sites/${c.id}`}
            className="block rounded-xl border bg-white p-4 transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{c.name}</p>
                {c.location && (
                  <p className="truncate text-xs text-slate-500">{c.location}</p>
                )}
              </div>
              <StatusBadge status={c.status} />
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-500">Progress</span>
                <span className="font-semibold text-slate-700">{c.avgProgress}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500"
                  style={{ width: `${c.avgProgress}%` }}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
              <KPI label="Plots" value={c.plots} />
              <KPI label="Active" value={c.inProgress} colour={c.inProgress > 0 ? "text-blue-600" : undefined} />
              <KPI label="Overdue" value={c.overdue} colour={c.overdue > 0 ? "text-red-600" : undefined} />
              <KPI label="Stale" value={c.staleSnags} colour={c.staleSnags > 0 ? "text-amber-600" : undefined} />
            </div>
          </Link>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">
          You don&apos;t have access to any sites yet. Ask an admin to assign
          you to one, or start a watch via any site you can see.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  colour,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  colour: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon className={`size-4 ${colour}`} aria-hidden />
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function KPI({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour?: string;
}) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={`font-semibold ${colour ?? "text-slate-700"}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-800"
      : status === "ON_HOLD"
        ? "bg-amber-100 text-amber-800"
        : status === "COMPLETED"
          ? "bg-blue-100 text-blue-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
