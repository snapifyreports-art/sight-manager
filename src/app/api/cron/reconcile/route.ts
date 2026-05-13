import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputePlotPercent } from "@/lib/plot-percent";
import { recomputeParentFromChildren } from "@/lib/parent-job";
import { calculateCascade } from "@/lib/cascade";

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
  // (May 2026 audit #84) Capture per-item failures rather than letting
  // one bad row crash the whole cron. The drift report still ships;
  // failures are surfaced in the response + logged separately.
  const plotErrors: Array<{ plotId: string; error: string }> = [];
  const parentErrors: Array<{ jobId: string; error: string }> = [];
  // (May 2026 audit #85) Track WHICH rows drifted, not just how many.
  // When `description` keeps repeating "adjusted 4 plots" night after
  // night, you need the IDs to chase down the leaking mutation path.
  const driftedPlots: Array<{ plotId: string; before: number; after: number }> = [];
  const driftedParents: string[] = [];

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
    try {
      await recomputePlotPercent(prisma, p.id);
      const after = await prisma.plot.findUnique({
        where: { id: p.id },
        select: { buildCompletePercent: true },
      });
      if (after && Math.abs(after.buildCompletePercent - before) > 0.01) {
        plotsAdjusted++;
        // Cap at 50 so a catastrophically broken night doesn't write
        // a multi-megabyte event log row.
        if (driftedPlots.length < 50) {
          driftedPlots.push({
            plotId: p.id,
            before: Math.round(before * 100) / 100,
            after: Math.round(after.buildCompletePercent * 100) / 100,
          });
        }
      }
    } catch (err) {
      plotErrors.push({
        plotId: p.id,
        error: err instanceof Error ? err.message : String(err),
      });
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
    try {
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
        if (driftedParents.length < 50) driftedParents.push(p.id);
      }
    } catch (err) {
      parentErrors.push({
        jobId: p.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // (#189) Sequential-overlap reconcile — fix plots where a still-
  // running predecessor leaves its downstream sitting in the past.
  //
  // Two patterns cause this:
  //   A) Job COMPLETED late (actualEndDate > endDate) without an
  //      explicit cascade trigger.
  //   B) Job IN_PROGRESS past its planned endDate — predecessor still
  //      active but downstream's startDate is already in the past
  //      relative to today.
  //
  // The action route's complete branch (#189) now auto-cascades on
  // late-completion, but pattern (B) accumulates daily — Foundation
  // running 3 days over puts Substructure 3 days in the past unless
  // someone explicitly delays. This cron picks that up nightly and
  // pushes downstream just enough to keep the math honest.
  //
  // Logged so the manager sees what was auto-adjusted overnight.
  let overlapPlotsFixed = 0;
  let overlapJobsShifted = 0;
  const overlapEvents: Array<{ plotId: string; triggerJobName: string; deltaDays: number; jobsShifted: number; reason: string }> = [];
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const overlapPlots = await prisma.plot.findMany({
      where: { site: { status: { not: "COMPLETED" } } },
      select: { id: true, name: true, plotNumber: true, siteId: true },
    });
    for (const plot of overlapPlots) {
      const jobs = await prisma.job.findMany({
        where: { plotId: plot.id, status: { not: "ON_HOLD" } },
        orderBy: { sortOrder: "asc" },
      });
      const triggers: Array<{ jobId: string; jobName: string; targetEndDate: Date; reason: string }> = [];
      for (const j of jobs) {
        if (!j.endDate) continue;
        const planned = new Date(j.endDate);
        planned.setHours(0, 0, 0, 0);
        const downstream = jobs.filter((d) => d.sortOrder > j.sortOrder && d.status !== "COMPLETED");
        const earliestDownstream = downstream
          .map((d) => d.startDate?.getTime() ?? Infinity)
          .reduce((min, t) => (t < min ? t : min), Infinity);
        if (j.status === "COMPLETED" && j.actualEndDate) {
          const actual = new Date(j.actualEndDate);
          actual.setHours(0, 0, 0, 0);
          if (actual.getTime() > planned.getTime() && earliestDownstream < actual.getTime()) {
            triggers.push({ jobId: j.id, jobName: j.name, targetEndDate: actual, reason: "late-completed" });
          }
        } else if (j.status === "IN_PROGRESS") {
          if (planned.getTime() < todayMidnight.getTime() && earliestDownstream < todayMidnight.getTime()) {
            triggers.push({ jobId: j.id, jobName: j.name, targetEndDate: todayMidnight, reason: "in-progress-overdue" });
          }
        }
      }
      if (triggers.length === 0) continue;
      for (const t of triggers) {
        const allOrders = await prisma.materialOrder.findMany({
          where: { jobId: { in: jobs.map((j) => j.id) } },
        });
        const result = calculateCascade(
          t.jobId,
          t.targetEndDate,
          jobs.map((j) => ({
            id: j.id, name: j.name,
            startDate: j.startDate, endDate: j.endDate,
            sortOrder: j.sortOrder, status: j.status,
            parentId: j.parentId ?? null,
          })),
          allOrders.map((o) => ({
            id: o.id, jobId: o.jobId,
            dateOfOrder: o.dateOfOrder,
            expectedDeliveryDate: o.expectedDeliveryDate,
            status: o.status,
          })),
        );
        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        await Promise.all([
          ...result.jobUpdates
            .filter((u) => u.jobId !== t.jobId)
            .map((u) => {
              const current = jobMap.get(u.jobId);
              return prisma.job.update({
                where: { id: u.jobId },
                data: {
                  startDate: u.newStart,
                  endDate: u.newEnd,
                  ...(!current?.originalStartDate && current?.startDate
                    ? { originalStartDate: current.startDate }
                    : {}),
                  ...(!current?.originalEndDate && current?.endDate
                    ? { originalEndDate: current.endDate }
                    : {}),
                },
              });
            }),
          ...result.orderUpdates.map((u) =>
            prisma.materialOrder.update({
              where: { id: u.orderId },
              data: {
                dateOfOrder: u.newOrderDate,
                expectedDeliveryDate: u.newDeliveryDate,
              },
            }),
          ),
        ]);
        const parentIds = new Set<string>();
        for (const u of result.jobUpdates) {
          const j = jobMap.get(u.jobId);
          if (j?.parentId) parentIds.add(j.parentId);
        }
        await Promise.all(
          Array.from(parentIds).map((pid) => recomputeParentFromChildren(prisma, pid)),
        );
        overlapJobsShifted += result.jobUpdates.length - 1;
        overlapEvents.push({
          plotId: plot.id,
          triggerJobName: t.jobName,
          deltaDays: result.deltaDays,
          jobsShifted: result.jobUpdates.length - 1,
          reason: t.reason,
        });
        // Refresh the local jobs cache so the next trigger in the
        // same plot sees the shifted state.
        const refreshed = await prisma.job.findMany({
          where: { plotId: plot.id, status: { not: "ON_HOLD" } },
          orderBy: { sortOrder: "asc" },
        });
        jobs.splice(0, jobs.length, ...refreshed);
      }
      overlapPlotsFixed++;
    }
    // One EventLog row per overlap that was auto-resolved so the
    // manager can see WHAT happened overnight.
    for (const ev of overlapEvents.slice(0, 20)) {
      await prisma.eventLog
        .create({
          data: {
            type: "SCHEDULE_CASCADED",
            description: `Auto-reconcile: "${ev.triggerJobName}" [${ev.reason}] → shifted ${ev.jobsShifted} downstream by ${ev.deltaDays} WD`,
            siteId: overlapPlots.find((p) => p.id === ev.plotId)?.siteId ?? null,
            plotId: ev.plotId,
            delayReasonType: "OTHER",
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error("[RECONCILE] Overlap pass failed:", err);
  }

  const durationMs = Date.now() - startedAt;

  // (May 2026 audit #85) Log only when something was actually adjusted
  // — keeps the events log signal-rich. Includes the first few drifted
  // IDs so a recurring entry ("adjusted 4 plots / X, Y, Z") points
  // directly at the leaking mutation path rather than just incrementing
  // a count.
  if (plotsAdjusted > 0 || parentsAdjusted > 0) {
    const sampleIds = [
      ...driftedPlots.slice(0, 5).map((d) => `plot:${d.plotId.slice(-6)}`),
      ...driftedParents.slice(0, 5).map((id) => `job:${id.slice(-6)}`),
    ].join(", ");
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description:
          `Nightly reconcile: adjusted ${plotsAdjusted}/${plotsScanned} plot percents` +
          ` and ${parentsAdjusted}/${parentsScanned} parent rollups in ${durationMs}ms` +
          (sampleIds ? ` (sample: ${sampleIds})` : ""),
      },
    });
  }

  // (May 2026 audit #84) Surface per-item failures separately so a
  // monitoring check can alert on errors without alerting on legit
  // drift adjustments.
  if (plotErrors.length > 0 || parentErrors.length > 0) {
    console.error(
      `[cron/reconcile] ${plotErrors.length} plot errors, ${parentErrors.length} parent errors`,
      { plotErrors: plotErrors.slice(0, 10), parentErrors: parentErrors.slice(0, 10) },
    );
  }

  return NextResponse.json({
    plotsScanned,
    plotsAdjusted,
    parentsScanned,
    parentsAdjusted,
    overlapPlotsFixed,
    overlapJobsShifted,
    plotErrors: plotErrors.length,
    parentErrors: parentErrors.length,
    durationMs,
    // (audit #86) Sample of drifted IDs in the response so an operator
    // can drill in immediately from the cron output without grepping
    // the events log.
    driftedPlotsSample: driftedPlots.slice(0, 10),
    driftedParentsSample: driftedParents.slice(0, 10),
    overlapEventsSample: overlapEvents.slice(0, 10),
  });
}
