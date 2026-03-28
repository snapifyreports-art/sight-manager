import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays, addDays, max as dateMax } from "date-fns";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/critical-path?plotId=xxx (optional filter)
// Computes the critical path for a site or plot using job dependencies (sortOrder)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const plotIdFilter = req.nextUrl.searchParams.get("plotId");

  // Get all plots with their jobs
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
          sortOrder: true,
          weatherAffected: true,
          parentId: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  // Calculate critical path per plot
  // Critical path = longest chain of sequential jobs (based on sortOrder dependencies)
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

    // Group by sortOrder to identify stages
    const stages: Map<number, typeof jobs> = new Map();
    for (const job of jobs) {
      const so = job.sortOrder;
      if (!stages.has(so)) stages.set(so, []);
      stages.get(so)!.push(job);
    }

    const sortedStageKeys = Array.from(stages.keys()).sort((a, b) => a - b);

    // Forward pass: calculate earliest start/finish
    interface NodeInfo {
      jobId: string;
      name: string;
      status: string;
      sortOrder: number;
      startDate: Date;
      endDate: Date;
      duration: number;
      earlyStart: number; // days from project start
      earlyFinish: number;
      lateStart: number;
      lateFinish: number;
      slack: number;
      isCritical: boolean;
      weatherAffected: boolean;
      assignee: string | null;
    }

    const projectStart = jobs.reduce(
      (min, j) => (new Date(j.startDate!) < min ? new Date(j.startDate!) : min),
      new Date(jobs[0].startDate!)
    );

    const nodes: NodeInfo[] = [];

    // Build nodes
    for (const job of jobs) {
      const start = new Date(job.startDate!);
      const end = new Date(job.endDate!);
      const duration = Math.max(1, differenceInDays(end, start));
      const earlyStart = differenceInDays(start, projectStart);

      nodes.push({
        jobId: job.id,
        name: job.name,
        status: job.status,
        sortOrder: job.sortOrder,
        startDate: start,
        endDate: end,
        duration,
        earlyStart,
        earlyFinish: earlyStart + duration,
        lateStart: 0,
        lateFinish: 0,
        slack: 0,
        isCritical: false,
        weatherAffected: job.weatherAffected,
        assignee: job.assignedTo?.name ?? null,
      });
    }

    // Project end = max earlyFinish
    const projectDuration = Math.max(...nodes.map((n) => n.earlyFinish));

    // Backward pass: calculate latest start/finish
    for (const node of nodes) {
      node.lateFinish = projectDuration;
    }

    // Process in reverse sort order
    for (let i = sortedStageKeys.length - 1; i >= 0; i--) {
      const stageKey = sortedStageKeys[i];
      const stageJobs = stages.get(stageKey)!;
      const stageNodes = nodes.filter((n) => n.sortOrder === stageKey);

      // If there's a next stage, the late finish is constrained by next stage's late start
      if (i < sortedStageKeys.length - 1) {
        const nextStageKey = sortedStageKeys[i + 1];
        const nextStageNodes = nodes.filter((n) => n.sortOrder === nextStageKey);
        const minNextLateStart = Math.min(...nextStageNodes.map((n) => n.lateStart));

        for (const node of stageNodes) {
          node.lateFinish = minNextLateStart;
        }
      }

      for (const node of stageNodes) {
        node.lateStart = node.lateFinish - node.duration;
        node.slack = node.lateStart - node.earlyStart;
        node.isCritical = node.slack <= 0;
      }
    }

    // Sort critical path jobs by earlyStart
    const criticalJobs = nodes
      .filter((n) => n.isCritical)
      .sort((a, b) => a.earlyStart - b.earlyStart);

    const projectedEnd = addDays(projectStart, projectDuration);

    return {
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      plotName: plot.name,
      houseType: plot.houseType,
      projectStart: projectStart.toISOString(),
      projectedEnd: projectedEnd.toISOString(),
      totalDuration: projectDuration,
      criticalPathJobs: criticalJobs.map((n) => ({
        jobId: n.jobId,
        name: n.name,
        status: n.status,
        startDate: n.startDate.toISOString(),
        endDate: n.endDate.toISOString(),
        duration: n.duration,
        slack: n.slack,
        isCritical: n.isCritical,
        weatherAffected: n.weatherAffected,
        assignee: n.assignee,
      })),
      allJobs: nodes.map((n) => ({
        jobId: n.jobId,
        name: n.name,
        status: n.status,
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
