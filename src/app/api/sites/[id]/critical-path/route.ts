import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { buildJobTimeline, type TimelineJobInput } from "@/lib/job-timeline";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/critical-path?plotId=xxx (optional filter)
//
// Returns the critical path for each plot. The "critical path" in our
// serial cascade model is just every leaf job in sortOrder — there are
// no parallel branches to be off-critical.
//
// **All timeline arithmetic is delegated to `buildJobTimeline`** — the
// canonical helper that every view sharing this concept must use. No
// view computes durations or offsets locally any more (May 2026 audit:
// Keith called out the SSOT failure pattern). If you need to change
// what "earlyStart" / "duration" means, change it in
// `src/lib/job-timeline.ts` and every consumer follows.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      id,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }
  const plotIdFilter = req.nextUrl.searchParams.get("plotId");

  // Pull every job (parents + children) so the helper can decide which
  // are leaves. Filtering parents at the DB level would deny the helper
  // the information it needs to classify isLeaf correctly.
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
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          originalStartDate: true,
          originalEndDate: true,
          sortOrder: true,
          weatherAffected: true,
          parentId: true,
          parentStage: true,
          stageCode: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  const plotPaths = plots.map((plot) => {
    if (plot.jobs.length === 0) {
      return {
        plotId: plot.id,
        plotNumber: plot.plotNumber,
        plotName: plot.name,
        houseType: plot.houseType,
        criticalPathJobs: [],
        allJobs: [],
        totalDuration: 0,
        projectedEnd: null,
        slackDays: 0,
      };
    }

    // Map raw rows → TimelineJobInput. Helper does the rest.
    const inputs: TimelineJobInput[] = plot.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      sortOrder: j.sortOrder,
      parentId: j.parentId,
      parentStage: j.parentStage,
      startDate: j.startDate,
      endDate: j.endDate,
      originalStartDate: j.originalStartDate,
      originalEndDate: j.originalEndDate,
      actualStartDate: j.actualStartDate,
      actualEndDate: j.actualEndDate,
      weatherAffected: j.weatherAffected,
      stageCode: j.stageCode,
      assignee: j.assignedTo?.name ?? null,
    }));

    const timeline = buildJobTimeline(inputs);

    // Critical path in a serial cascade = every leaf job. allJobs in
    // the legacy response shape used to include parents too, but the
    // UI re-renders them as duplicates (Foundation 32d, Dig & pour 22d,
    // Brickwork 1d showing the same span 3x). Serve only leaves.
    const renderable = timeline.leafJobs.map((j) => ({
      jobId: j.id,
      name: j.name,
      status: j.status,
      parentStage: j.parentStage,
      // Render uses planned timeline (current plan). Original / actual
      // are available on the helper output if a future view needs them.
      startDate: j.planned.start.toISOString(),
      endDate: j.planned.end.toISOString(),
      duration: j.planned.durationDays,
      earlyStart: j.planned.offsetFromStart,
      earlyFinish: j.planned.offsetFromStart + j.planned.durationDays,
      // Slack is meaningless in our serial model — every leaf is critical.
      // Field kept for backwards compat with the existing UI.
      slack: 0,
      isCritical: true,
      weatherAffected: j.weatherAffected,
      assignee: j.assignee,
    }));

    return {
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      plotName: plot.name,
      houseType: plot.houseType,
      projectStart: timeline.plotStart.toISOString(),
      projectedEnd: timeline.plotEnd.toISOString(),
      totalDuration: timeline.totalWorkingDays,
      criticalPathJobs: renderable,
      allJobs: renderable,
    };
  });

  // Site-level critical path = plot with the longest total duration.
  const siteCriticalPlot = plotPaths.reduce<typeof plotPaths[number] | null>(
    (latest, p) =>
      p.totalDuration > (latest?.totalDuration ?? 0) ? p : latest,
    plotPaths[0] ?? null,
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
