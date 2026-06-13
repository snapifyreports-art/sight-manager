import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputePlotPercent } from "@/lib/plot-percent";
import { recomputeParentFromChildren } from "@/lib/parent-job";
import { recomputeInspectionDates } from "@/lib/inspection-dates";
import { calculateCascade } from "@/lib/cascade";
import { getServerCurrentDate } from "@/lib/dev-date";
import { logEvent } from "@/lib/event-log";
import { sendPushToSiteAudience } from "@/lib/push";

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
 * Scheduled in vercel.json (04:00 UTC — first of the morning crons).
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
  // (Jun 2026 audit) ARCHIVED sites excluded — no point reconciling
  // (or alerting on) sites someone deliberately shelved.
  const activePlots = await prisma.plot.findMany({
    where: {
      site: { status: { notIn: ["COMPLETED", "ARCHIVED"] } },
    },
    select: { id: true, buildCompletePercent: true },
  });

  // (May 2026 audit P-P0) Process in chunks of 10 in parallel rather
  // than strictly serially. Each recompute is one query (after the
  // P-P0-9 fix); 10 concurrent fits comfortably under Prisma's
  // default 10-connection Supabase pool. At 50 plots that's
  // 5 sequential rounds of 10 instead of 50 sequential rounds —
  // ~5× speedup on this pass alone. Errors per plot stay scoped.
  const PLOT_BATCH = 10;
  for (let i = 0; i < activePlots.length; i += PLOT_BATCH) {
    const batch = activePlots.slice(i, i + PLOT_BATCH);
    await Promise.all(
      batch.map(async (p) => {
        plotsScanned++;
        const before = p.buildCompletePercent;
        try {
          const after = await recomputePlotPercent(prisma, p.id);
          if (Math.abs(after - before) > 0.01) {
            plotsAdjusted++;
            // Cap at 50 so a catastrophically broken night doesn't
            // write a multi-megabyte event log row.
            if (driftedPlots.length < 50) {
              driftedPlots.push({
                plotId: p.id,
                before: Math.round(before * 100) / 100,
                after: Math.round(after * 100) / 100,
              });
            }
          }
        } catch (err) {
          plotErrors.push({
            plotId: p.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  // ---- Parent-job rollup reconcile ----
  // Only parent jobs (jobs with at least one child).
  const parentJobs = await prisma.job.findMany({
    where: {
      children: { some: {} },
      plot: { site: { status: { notIn: ["COMPLETED", "ARCHIVED"] } } },
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

  // (May 2026 audit P-P0) Same parallel-batch pattern as the plot pass.
  // 300 parents × 1 round-trip serial = 30s+ of wall time at scale;
  // batches of 10 = 30 sequential rounds.
  const PARENT_BATCH = 10;
  for (let i = 0; i < parentJobs.length; i += PARENT_BATCH) {
    const batch = parentJobs.slice(i, i + PARENT_BATCH);
    await Promise.all(
      batch.map(async (p) => {
        parentsScanned++;
        try {
          const after = await recomputeParentFromChildren(prisma, p.id);
          if (
            after &&
            (after.startDate?.getTime() !== p.startDate?.getTime() ||
              after.endDate?.getTime() !== p.endDate?.getTime() ||
              after.status !== p.status ||
              after.actualStartDate?.getTime() !== p.actualStartDate?.getTime() ||
              after.actualEndDate?.getTime() !== p.actualEndDate?.getTime())
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
      }),
    );
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
    // (May 2026 audit B-7) Pre-fix the overlap pass used raw `new Date()`
    // which bypasses the dev-date harness — every other cron uses
    // `getServerCurrentDate(req)`. In dev (simulated date) the overlap
    // detection ran against today instead of the simulated day, missing
    // overlaps the user was actually trying to test for.
    const todayMidnight = getServerCurrentDate(req);
    todayMidnight.setHours(0, 0, 0, 0);
    const overlapPlots = await prisma.plot.findMany({
      where: { site: { status: { notIn: ["COMPLETED", "ARCHIVED"] } } },
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
      // (Jun 2026) Anchored inspections shift with the auto-cascaded
      // jobs — inspection-dates.ts contract: every code path that moves
      // a job's dates must recompute, and this is the one path that runs
      // unattended every night. Once per plot that had overlap fixes.
      await recomputeInspectionDates(prisma, plot.id, todayMidnight);
      overlapPlotsFixed++;
    }
    // One EventLog row per overlap that was auto-resolved so the
    // manager can see WHAT happened overnight.
    for (const ev of overlapEvents.slice(0, 20)) {
      await logEvent(prisma, {
        type: "SCHEDULE_CASCADED",
        description: `Auto-reconcile: "${ev.triggerJobName}" [${ev.reason}] → shifted ${ev.jobsShifted} downstream by ${ev.deltaDays} WD`,
        siteId: overlapPlots.find((p) => p.id === ev.plotId)?.siteId ?? null,
        plotId: ev.plotId,
        delayReasonType: "OTHER",
        detail: {
          jobName: ev.triggerJobName,
          reason: ev.reason,
          jobsShifted: ev.jobsShifted,
          deltaDays: ev.deltaDays,
          trigger: "auto-reconcile",
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[RECONCILE] Overlap pass failed:", err);
  }

  // ---- (Jun 2026 R26) Compliance expiry reconcile ----
  // Folded into reconcile (not daily-email) because flipping a cached
  // status field back into line with reality is exactly what this cron
  // already does for plot percents and parent rollups. Any compliance
  // item whose expiresAt has passed and isn't already EXPIRED/EXEMPT is
  // flipped to EXPIRED. The 14-day "warn" window is a read-side concern
  // (dashboard At-Risk + ?tab=compliance) — no status change for those.
  //
  // (Jun 2026 R26) After the flip, a daily push warns the site audience
  // about anything expired OR within 14 days of expiry — see the push
  // pass below. ON_HOLD sites get the status flip (data) but no push.
  let complianceExpiredFlipped = 0;
  let compliancePushed = 0;
  const complianceErrors: Array<{ itemId: string; error: string }> = [];
  try {
    const complianceToday = getServerCurrentDate(req);
    complianceToday.setHours(0, 0, 0, 0);
    const newlyExpired = await prisma.siteComplianceItem.findMany({
      where: {
        expiresAt: { lt: complianceToday },
        // EXEMPT items are deliberately out of scope; EXPIRED already done.
        status: { in: ["PENDING", "ACTIVE"] },
        site: { status: { notIn: ["COMPLETED", "ARCHIVED"] } },
      },
      select: { id: true, name: true, siteId: true, expiresAt: true },
    });
    for (const item of newlyExpired) {
      try {
        await prisma.siteComplianceItem.update({
          where: { id: item.id },
          data: { status: "EXPIRED" },
        });
        complianceExpiredFlipped++;
        await logEvent(prisma, {
          type: "USER_ACTION",
          description: `Compliance item "${item.name}" expired (was due ${item.expiresAt ? item.expiresAt.toISOString().slice(0, 10) : "?"}) — marked EXPIRED`,
          siteId: item.siteId,
          detail: { complianceItemId: item.id, status: "EXPIRED" },
        }).catch(() => {});
      } catch (err) {
        complianceErrors.push({
          itemId: item.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error("[RECONCILE] Compliance expiry pass failed:", err);
  }

  // ---- (Jun 2026 R26) Compliance expiry push ----
  // Daily nudge — items already expired or within 14 days of expiry, on
  // ACTIVE sites only (ON_HOLD = data flip above, no push, per R12).
  // Repeats daily like the inspection-overdue nag; preferences + the
  // WatchedSite mute let a manager silence it.
  try {
    const cToday = getServerCurrentDate(req);
    cToday.setHours(0, 0, 0, 0);
    const warnBy = new Date(cToday);
    warnBy.setDate(warnBy.getDate() + 14);
    const dueItems = await prisma.siteComplianceItem.findMany({
      where: {
        expiresAt: { not: null, lte: warnBy },
        status: { in: ["PENDING", "ACTIVE", "EXPIRED"] },
        site: { status: "ACTIVE" },
      },
      select: { id: true, name: true, siteId: true, expiresAt: true, status: true },
      orderBy: { expiresAt: "asc" },
    });
    const bySite = new Map<string, typeof dueItems>();
    for (const it of dueItems) {
      const arr = bySite.get(it.siteId) ?? [];
      arr.push(it);
      bySite.set(it.siteId, arr);
    }
    for (const [siteId, items] of bySite) {
      const expired = items.filter((i) => i.status === "EXPIRED").length;
      const soon = items.length - expired;
      const title =
        expired > 0
          ? `⚠️ ${expired} compliance ${expired === 1 ? "item" : "items"} expired`
          : `📋 ${soon} compliance ${soon === 1 ? "item" : "items"} expiring soon`;
      const body = items
        .slice(0, 5)
        .map((i) => `${i.name}${i.status === "EXPIRED" ? " (expired)" : i.expiresAt ? ` — ${i.expiresAt.toISOString().slice(0, 10)}` : ""}`)
        .join(", ");
      await sendPushToSiteAudience(siteId, "COMPLIANCE_EXPIRING", {
        title,
        body,
        url: `/sites/${siteId}?tab=compliance`,
        tag: `compliance-${siteId}`,
      }).catch(() => {});
      compliancePushed += items.length;
    }
  } catch (err) {
    console.error("[RECONCILE] Compliance expiry push failed:", err);
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
    await logEvent(prisma, {
      type: "USER_ACTION",
      description:
        `Nightly reconcile: adjusted ${plotsAdjusted}/${plotsScanned} plot percents` +
        ` and ${parentsAdjusted}/${parentsScanned} parent rollups in ${durationMs}ms` +
        (sampleIds ? ` (sample: ${sampleIds})` : ""),
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
    // (Jun 2026 R26) Compliance items flipped to EXPIRED this run + the
    // count covered by the daily expiring/expired push.
    complianceExpiredFlipped,
    compliancePushed,
    complianceErrors: complianceErrors.length,
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
