import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { differenceInWorkingDays } from "@/lib/working-days";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/critical-path?plotId=xxx (optional filter)
//
// Critical path for a site or plot. Per the May 2026 audit (Keith:
// "these critical paths are absolutely baffling me"), this was rewritten:
//
// 1. LEAF JOBS ONLY — parent rollups were being included alongside their
//    children, so "Foundation 32d" + "Dig & pour 22d" + "Brickwork 1d"
//    showed the same work three times. Filter `children: { none: {} }`.
//
// 2. WORKING DAYS, not calendar — matches addWorkingDays /
//    differenceInWorkingDays everywhere else. Calendar-day arithmetic
//    inflated bar widths over weekends and made pull-forward shifts
//    look completely wrong.
//
// 3. SORT BY sortOrder, not by recomputed earlyStart. Our cascade model
//    is sequential by sortOrder, so the path is just every leaf job in
//    that order. earlyStart is now a derived display field, not the
//    primary sort.
//
// 4. CRITICAL = ALL leaf jobs, since the schedule is serial. The "slack"
//    field stays in the response for backwards compat but is always 0.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const plotIdFilter = req.nextUrl.searchParams.get("plotId");

  // LEAF jobs only — `children: { none: {} }` filter excludes parent
  // stage rollups (Foundation, Superstructure, etc.) so they don't
  // duplicate their own work.
  const plots = await prisma.plot.findMany({
    where: {
      siteId: id,
      ...(plotIdFilter ? { id: plotIdFilter } : {}),
    },
    select: {
      id: true,
      plotNumber: true,
      name: true,
      houseType: true,
      jobs: {
        where: { children: { none: {} } },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          sortOrder: true,
          weatherAffected: true,
          parentId: true,
          parentStage: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  const plotPaths = plots.map((plot) => {
    const jobs = plot.jobs.filter((j) => j.startDate && j.endDate);

    if (jobs.length === 0) {
      return {
        plotId: plot.id,
        plotNumber: plot.plotNumber,
        plotName: plot.name,
        houseType: plot.houseType,
        criticalPathJobs: [],
        totalDuration: 0,
        projectedEnd: null,
        slackDays: 0,
      };
    }

    interface NodeInfo {
      jobId: string;
      name: string;
      status: string;
      sortOrder: number;
      parentStage: string | null;
      startDate: Date;
      endDate: Date;
      duration: number; // working days
      earlyStart: number; // working days from plot start
      earlyFinish: number;
      slack: number;
      isCritical: boolean;
      weatherAffected: boolean;
      assignee: string | null;
    }

    // Plot start = the earliest start of any leaf job. Use this as the
    // anchor for earlyStart calculations.
    const plotStart = jobs.reduce<Date>(
      (min, j) =>
        new Date(j.startDate!) < min ? new Date(j.startDate!) : min,
      new Date(jobs[0].startDate!),
    );

    const nodes: NodeInfo[] = jobs.map((job) => {
      const start = new Date(job.startDate!);
      const end = new Date(job.endDate!);
      // Working-day duration. addWorkingDays(start, n) = end means n
      // working days, but we compute via difference to be tolerant of
      // legacy/edge data. Floor at 1 so a same-day job still draws.
      const duration = Math.max(1, differenceInWorkingDays(end, start));
      const earlyStart = Math.max(0, differenceInWorkingDays(start, plotStart));

      return {
        jobId: job.id,
        name: job.name,
        status: job.status,
        sortOrder: job.sortOrder,
        parentStage: job.parentStage,
        startDate: start,
        endDate: end,
        duration,
        earlyStart,
        earlyFinish: earlyStart + duration,
        // Slack is meaningless in a serial cascade — every leaf job
        // determines the plot's end date, so they're all critical.
        slack: 0,
        isCritical: true,
        weatherAffected: job.weatherAffected,
        assignee: job.assignedTo?.name ?? null,
      };
    });

    // Project duration in working days = the latest earlyFinish
    const projectDuration = Math.max(...nodes.map((n) => n.earlyFinish));

    // Projected end = the latest job endDate (already in working-day
    // calendar terms). No need to addWorkingDays(plotStart, duration)
    // — the underlying jobs already encode the answer.
    const projectedEnd = nodes
      .map((n) => n.endDate)
      .reduce<Date>(
        (max, d) => (d > max ? d : max),
        nodes[0].endDate,
      );

    // Already in sortOrder thanks to the orderBy on the query.
    return {
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      plotName: plot.name,
      houseType: plot.houseType,
      projectStart: plotStart.toISOString(),
      projectedEnd: projectedEnd.toISOString(),
      totalDuration: projectDuration,
      criticalPathJobs: nodes.map((n) => ({
        jobId: n.jobId,
        name: n.name,
        status: n.status,
        parentStage: n.parentStage,
        startDate: n.startDate.toISOString(),
        endDate: n.endDate.toISOString(),
        duration: n.duration,
        earlyStart: n.earlyStart,
        earlyFinish: n.earlyFinish,
        slack: n.slack,
        isCritical: n.isCritical,
        weatherAffected: n.weatherAffected,
        assignee: n.assignee,
      })),
      allJobs: nodes.map((n) => ({
        jobId: n.jobId,
        name: n.name,
        status: n.status,
        parentStage: n.parentStage,
        startDate: n.startDate.toISOString(),
        endDate: n.endDate.toISOString(),
        duration: n.duration,
        earlyStart: n.earlyStart,
        earlyFinish: n.earlyFinish,
        slack: n.slack,
        isCritical: n.isCritical,
        weatherAffected: n.weatherAffected,
        assignee: n.assignee,
      })),
    };
  });

  // Site-level critical path = plot with latest projected end
  const siteCriticalPlot = plotPaths.reduce(
    (latest, p) =>
      p.totalDuration > (latest?.totalDuration ?? 0) ? p : latest,
    plotPaths[0] ?? null
  );

  return NextResponse.json({
    siteId: id,
    generatedAt: new Date().toISOString(),
    siteCriticalPlotId: siteCriticalPlot?.plotId ?? null,
    siteCriticalPlotNumber: siteCriticalPlot?.plotNumber ?? null,
    siteProjectedEnd: siteCriticalPlot?.projectedEnd ?? null,
    siteTotalDuration: siteCriticalPlot?.totalDuration ?? 0,
    plots: plotPaths,
  });
}
