/**
 * Repair script: re-cascade job dates on plots that were applied
 * BEFORE the May 2026 stage-cascade fix (commit 27331d3). Those
 * plots have gaps in their job dates because apply-template anchored
 * each stage from the template's cached startWeek field, which can
 * drift from the canonical durationDays totals.
 *
 * What this does for each plot:
 *
 *   1. Skip if ANY job is IN_PROGRESS / COMPLETED — don't touch live work.
 *   2. Take the EARLIEST job's startDate as the plot's original start
 *      (Plot model doesn't store startDate directly; this reconstructs).
 *   3. Pull the source template + variant (variantId on Plot, set at
 *      apply time).
 *   4. Run computeTemplateDateMap (already canonical post-fix) to
 *      produce the correct date per template job.
 *   5. Match each plot job to its template job by composite key
 *      (parentStage + name) — e.g. "Foundation > Brickwork" — and
 *      update startDate / endDate / originalStartDate / originalEndDate.
 *
 * Pure dates update — job IDs, contractors, snags, materials, etc.
 * stay intact. MaterialOrder dates would also drift but those are
 * a separate concern; this fixes the visible Gantt issue.
 *
 * Usage:
 *   npx tsx scripts/repair-plot-cascade.ts <siteName>
 *   npx tsx scripts/repair-plot-cascade.ts "Old Hall Village"
 *   npx tsx scripts/repair-plot-cascade.ts --all   # every plot in DB
 */

import { PrismaClient } from "@prisma/client";
import { snapToWorkingDay, addWorkingDays } from "../src/lib/working-days";

const prisma = new PrismaClient();

interface DateWindow {
  start: Date;
  end: Date;
}

async function repairPlot(
  plotId: string,
  plotName: string,
): Promise<{
  status: "ok" | "skipped" | "no-template" | "no-jobs";
  reason?: string;
  updated?: number;
}> {
  // Pull the plot + jobs + source links.
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: {
      id: true,
      name: true,
      sourceTemplateId: true,
      sourceVariantId: true,
      jobs: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          parentStage: true,
          stageCode: true,
          status: true,
          startDate: true,
          endDate: true,
          parentId: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!plot) return { status: "skipped", reason: "plot not found" };
  if (plot.jobs.length === 0)
    return { status: "no-jobs", reason: "no jobs to repair" };
  if (!plot.sourceTemplateId)
    return {
      status: "no-template",
      reason: "no sourceTemplateId — plot was created blank or pre-template",
    };
  // Don't touch live work.
  const liveJob = plot.jobs.find((j) => j.status !== "NOT_STARTED");
  if (liveJob) {
    return {
      status: "skipped",
      reason: `job "${liveJob.name}" is ${liveJob.status} — leaving plot alone`,
    };
  }
  // Earliest job's start = plotStartDate (good enough — apply snaps
  // to a working day, so the first job is the start).
  const earliest = plot.jobs
    .filter((j) => j.startDate)
    .sort(
      (a, b) =>
        (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0),
    )[0];
  if (!earliest?.startDate)
    return { status: "skipped", reason: "no job has a startDate" };
  const plotStartDate = earliest.startDate;

  // Pull the template's job tree, scoped by variant if set.
  const variantId = plot.sourceVariantId;
  const stages = await prisma.templateJob.findMany({
    where: {
      templateId: plot.sourceTemplateId,
      variantId: variantId,
      parentId: null,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      children: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (stages.length === 0)
    return {
      status: "skipped",
      reason: "source template has no jobs in the right scope",
    };

  // Run the same canonical cascade as apply-template-helpers
  // (replicated here rather than imported because that module's
  // exported helper takes Prisma transaction context we don't need).
  const dateMap = new Map<string, DateWindow>();
  let stageCursor = plotStartDate;
  for (const stage of stages) {
    if (stage.children.length > 0) {
      const parentAnchor = snapToWorkingDay(stageCursor, "forward");
      let cursor = parentAnchor;
      let firstChildStart: Date | null = null;
      let lastChildEnd: Date | null = null;
      for (const c of stage.children) {
        const days =
          c.durationDays && c.durationDays > 0
            ? c.durationDays
            : c.durationWeeks && c.durationWeeks > 0
              ? c.durationWeeks * 5
              : 5;
        const cStart = snapToWorkingDay(cursor, "forward");
        const cEnd = addWorkingDays(cStart, days - 1);
        // Match plot jobs by composite key "parentStage|name".
        const key = `${stage.name}|${c.name}`;
        dateMap.set(key, { start: cStart, end: cEnd });
        firstChildStart ??= cStart;
        lastChildEnd = cEnd;
        cursor = addWorkingDays(cEnd, 1);
      }
      const stageStart = firstChildStart ?? parentAnchor;
      const stageEnd = lastChildEnd ?? parentAnchor;
      // Parent stage stored under its own composite key (parentStage = null).
      dateMap.set(`|${stage.name}`, { start: stageStart, end: stageEnd });
      stageCursor = addWorkingDays(stageEnd, 1);
    } else {
      const days =
        stage.durationDays && stage.durationDays > 0
          ? stage.durationDays
          : stage.durationWeeks && stage.durationWeeks > 0
            ? stage.durationWeeks * 5
            : 5;
      const start = snapToWorkingDay(stageCursor, "forward");
      const end = addWorkingDays(start, days - 1);
      dateMap.set(`|${stage.name}`, { start, end });
      stageCursor = addWorkingDays(end, 1);
    }
  }

  // Update each plot job's dates.
  let updated = 0;
  for (const job of plot.jobs) {
    const key = `${job.parentStage ?? ""}|${job.name}`;
    const win = dateMap.get(key);
    if (!win) continue; // job's name doesn't match — skip silently
    const sameStart = job.startDate?.getTime() === win.start.getTime();
    const sameEnd = job.endDate?.getTime() === win.end.getTime();
    if (sameStart && sameEnd) continue;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        startDate: win.start,
        endDate: win.end,
        originalStartDate: win.start,
        originalEndDate: win.end,
      },
    });
    updated += 1;
  }
  return { status: "ok", updated };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      'Usage: npx tsx scripts/repair-plot-cascade.ts <siteName | --all>',
    );
    process.exit(1);
  }

  const where =
    arg === "--all"
      ? {}
      : { site: { name: arg } };

  const plots = await prisma.plot.findMany({
    where,
    select: { id: true, name: true, plotNumber: true, site: { select: { name: true } } },
    orderBy: [{ site: { name: "asc" } }, { plotNumber: "asc" }],
  });

  if (plots.length === 0) {
    console.log("No plots match.");
    return;
  }

  console.log(`Repairing ${plots.length} plot${plots.length === 1 ? "" : "s"}…\n`);

  let okCount = 0;
  let skippedCount = 0;
  let totalJobsUpdated = 0;

  for (const p of plots) {
    const result = await repairPlot(p.id, p.name);
    const label = `${p.site.name}/${p.plotNumber ?? p.name}`;
    if (result.status === "ok") {
      console.log(
        `  ✓ ${label.padEnd(30)} updated ${result.updated} job dates`,
      );
      okCount += 1;
      totalJobsUpdated += result.updated ?? 0;
    } else {
      console.log(
        `  – ${label.padEnd(30)} ${result.status} (${result.reason})`,
      );
      skippedCount += 1;
    }
  }

  console.log(
    `\nDone. ${okCount} repaired, ${skippedCount} skipped, ${totalJobsUpdated} job dates updated.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
