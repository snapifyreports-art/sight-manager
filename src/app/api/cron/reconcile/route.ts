import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputePlotPercent } from "@/lib/plot-percent";
import { recomputeParentFromChildren } from "@/lib/parent-job";

export const dynamic = "force-dynamic";

/**
 * Nightly reconcile — defence-in-depth safety net for cached fields.
 *
 * Even after the May 2026 audit fixes wired `recomputePlotPercent` and
 * `recomputeParentFromChildren` into every mutation site we know
 * about, a future code change could still introduce a new mutation
 * path that forgets the recompute. Rather than letting drift
 * accumulate for weeks until someone notices, this cron runs once a
 * night and brings every plot percent + parent-job rollup back into
 * line with its leaves.
 *
 * Logged drift so we can spot if a new code path is introducing it
 * regularly — pattern that says "go fix that mutation site".
 *
 * Scheduled in vercel.json (5am UTC alongside the other crons).
 */
export async function GET(req: NextRequest) {
  const { checkCronAuth } = await import("@/lib/cron-auth");
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  let plotsScanned = 0;
  let plotsAdjusted = 0;
  let parentsScanned = 0;
  let parentsAdjusted = 0;

  // ---- Plot percent reconcile ----
  // Active plots only — completed plots don't move and we don't care
  // if their cache drifts past the point of completion.
  const activePlots = await prisma.plot.findMany({
    where: {
      site: { status: { not: "COMPLETED" } },
    },
    select: { id: true, buildCompletePercent: true },
  });

  for (const p of activePlots) {
    plotsScanned++;
    const before = p.buildCompletePercent;
    await recomputePlotPercent(prisma, p.id);
    const after = await prisma.plot.findUnique({
      where: { id: p.id },
      select: { buildCompletePercent: true },
    });
    if (after && Math.abs(after.buildCompletePercent - before) > 0.01) {
      plotsAdjusted++;
    }
  }

  // ---- Parent-job rollup reconcile ----
  // Only parent jobs (jobs with at least one child).
  const parentJobs = await prisma.job.findMany({
    where: {
      children: { some: {} },
      plot: { site: { status: { not: "COMPLETED" } } },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      actualStartDate: true,
      actualEndDate: true,
      originalStartDate: true,
      originalEndDate: true,
    },
  });

  for (const p of parentJobs) {
    parentsScanned++;
    await recomputeParentFromChildren(prisma, p.id);
    const after = await prisma.job.findUnique({
      where: { id: p.id },
      select: {
        startDate: true,
        endDate: true,
        status: true,
        actualStartDate: true,
        actualEndDate: true,
        originalStartDate: true,
        originalEndDate: true,
      },
    });
    if (
      after &&
      (after.startDate?.getTime() !== p.startDate?.getTime() ||
        after.endDate?.getTime() !== p.endDate?.getTime() ||
        after.status !== p.status ||
        after.actualStartDate?.getTime() !== p.actualStartDate?.getTime() ||
        after.actualEndDate?.getTime() !== p.actualEndDate?.getTime() ||
        after.originalStartDate?.getTime() !== p.originalStartDate?.getTime() ||
        after.originalEndDate?.getTime() !== p.originalEndDate?.getTime())
    ) {
      parentsAdjusted++;
    }
  }

  const durationMs = Date.now() - startedAt;

  // Log only when something was actually adjusted — keeps the events
  // log signal-rich. If you see this firing nightly, find the
  // mutation path leaking and route it through the helpers.
  if (plotsAdjusted > 0 || parentsAdjusted > 0) {
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Nightly reconcile: adjusted ${plotsAdjusted}/${plotsScanned} plot percents and ${parentsAdjusted}/${parentsScanned} parent rollups in ${durationMs}ms`,
      },
    });
  }

  return NextResponse.json({
    plotsScanned,
    plotsAdjusted,
    parentsScanned,
    parentsAdjusted,
    durationMs,
  });
}
