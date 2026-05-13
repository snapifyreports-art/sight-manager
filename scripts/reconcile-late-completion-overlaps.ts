/**
 * (#189) One-shot: find plots where a job's downstream jobs are
 * frozen at a startDate that's earlier than the predecessor's
 * actualEndDate. Cascade the gap forward so the programme stays
 * sequential.
 *
 * Cause: pre-fix the actions-route `complete` branch didn't
 * cascade when a job finished LATE. So actualEndDate landed in
 * the future but downstream jobs stayed at the old planned dates,
 * silently overlapping with the now-extended predecessor. Keith
 * caught this on Plot 1 — "Final" sat in July while "Foundation"
 * was still in progress in May.
 *
 *   npx tsx scripts/reconcile-late-completion-overlaps.ts          # report only
 *   npx tsx scripts/reconcile-late-completion-overlaps.ts --apply  # apply fix
 *
 * Strategy: for every plot, walk jobs in sortOrder. For each
 * completed job, if its actualEndDate > endDate (late) AND the
 * next-sortOrder job's startDate < actualEndDate (overlap),
 * run the cascade engine to shift downstream by the delta.
 */

import { PrismaClient } from "@prisma/client";
import { calculateCascade } from "../src/lib/cascade";
import { recomputeParentFromChildren } from "../src/lib/parent-job";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface JobRow {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  actualEndDate: Date | null;
  sortOrder: number;
  status: string;
  parentId: string | null;
  plotId: string;
}

async function main() {
  const plots = await prisma.plot.findMany({ select: { id: true, name: true, plotNumber: true, siteId: true } });
  console.log(`Scanning ${plots.length} plots…`);

  let plotsTouched = 0;
  let jobsShifted = 0;

  for (const plot of plots) {
    const jobs = await prisma.job.findMany({
      where: { plotId: plot.id, status: { not: "ON_HOLD" } },
      orderBy: { sortOrder: "asc" },
    });

    // Find every job whose downstream is in conflict with reality.
    //
    // Two patterns produce overlap:
    //   A) COMPLETED late — actualEndDate > endDate, downstream froze.
    //   B) IN_PROGRESS past endDate — predecessor still running, but
    //      downstream's startDate is in the past relative to today.
    //      Push the predecessor's endDate to today (so its duration
    //      reflects reality) and cascade.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const triggers: { trigger: JobRow; targetEndDate: Date; reason: string }[] = [];
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
          triggers.push({ trigger: j as JobRow, targetEndDate: actual, reason: "late-completed" });
        }
      } else if (j.status === "IN_PROGRESS") {
        // If still running past planned endDate, push to today so the
        // duration reflects "at least running until now".
        if (planned.getTime() < today.getTime() && earliestDownstream < today.getTime()) {
          triggers.push({ trigger: j as JobRow, targetEndDate: today, reason: "in-progress-overdue" });
        }
      }
    }

    if (triggers.length === 0) continue;

    const plotLabel = plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
    console.log(`\n${plotLabel}: ${triggers.length} late-complete overlap(s).`);

    for (const { trigger, targetEndDate, reason } of triggers) {
      void reason;
      const allOrders = await prisma.materialOrder.findMany({
        where: { jobId: { in: jobs.map((j) => j.id) } },
      });
      const result = calculateCascade(
        trigger.id,
        targetEndDate,
        jobs.map((j) => ({
          id: j.id,
          name: j.name,
          startDate: j.startDate,
          endDate: j.endDate,
          sortOrder: j.sortOrder,
          status: j.status,
          parentId: j.parentId ?? null,
        })),
        allOrders.map((o) => ({
          id: o.id,
          jobId: o.jobId,
          dateOfOrder: o.dateOfOrder,
          expectedDeliveryDate: o.expectedDeliveryDate,
          status: o.status,
        })),
      );
      console.log(`  "${trigger.name}" [${reason}] → shift ${result.jobUpdates.length - 1} downstream by ${result.deltaDays}WD`);
      if (!APPLY) continue;

      const jobMap = new Map(jobs.map((j) => [j.id, j]));
      await Promise.all([
        ...result.jobUpdates
          .filter((u) => u.jobId !== trigger.id)
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
      jobsShifted += result.jobUpdates.length - 1;
      const parentIds = new Set<string>();
      for (const u of result.jobUpdates) {
        const j = jobMap.get(u.jobId);
        if (j?.parentId) parentIds.add(j.parentId);
      }
      await Promise.all(
        Array.from(parentIds).map((pid) => recomputeParentFromChildren(prisma, pid)),
      );
      // Refresh local jobs list so next trigger sees the updated state.
      const refreshed = await prisma.job.findMany({
        where: { plotId: plot.id, status: { not: "ON_HOLD" } },
        orderBy: { sortOrder: "asc" },
      });
      jobs.splice(0, jobs.length, ...refreshed);
    }

    plotsTouched++;
  }

  console.log(`\nDone. Plots with overlap: ${plotsTouched}. Jobs shifted: ${jobsShifted}.`);
  if (!APPLY && plotsTouched > 0) {
    console.log("Report-only. Re-run with --apply to commit the shifts.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
