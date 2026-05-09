/**
 * One-shot run of the nightly reconcile to fix any pre-existing
 * drift NOW. Same logic as /api/cron/reconcile but invoked locally
 * via tsx.
 */

import { PrismaClient } from "@prisma/client";
import { recomputePlotPercent } from "../src/lib/plot-percent";
import { recomputeParentFromChildren } from "../src/lib/parent-job";

const prisma = new PrismaClient();

async function main() {
  let plotsScanned = 0;
  let plotsAdjusted = 0;
  let parentsScanned = 0;
  let parentsAdjusted = 0;

  console.log("Reconciling plot buildCompletePercent…");
  const activePlots = await prisma.plot.findMany({
    where: { site: { status: { not: "COMPLETED" } } },
    select: { id: true, buildCompletePercent: true, plotNumber: true },
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
      console.log(
        `  · plot ${p.plotNumber || p.id}: ${before.toFixed(2)} → ${after.buildCompletePercent.toFixed(2)}`,
      );
    }
  }
  console.log(`  ${plotsAdjusted} of ${plotsScanned} plots adjusted.`);

  console.log("Reconciling parent-job rollups…");
  const parentJobs = await prisma.job.findMany({
    where: {
      children: { some: {} },
      plot: { site: { status: { not: "COMPLETED" } } },
    },
    select: {
      id: true,
      name: true,
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
      console.log(`  · parent "${p.name}": rollup adjusted`);
    }
  }
  console.log(`  ${parentsAdjusted} of ${parentsScanned} parents adjusted.`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
