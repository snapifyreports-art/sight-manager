/**
 * Re-baseline originalStartDate / originalEndDate for jobs that haven't
 * actually started yet.
 *
 * Why we need this: when apply-template ran with the pre-May-2026
 * cascade bug (anchoring stages from cached startWeek instead of
 * cascading sequentially from plotStartDate), originalStartDate /
 * originalEndDate were locked in to the buggy layout. After the fix,
 * startDate cascades correctly but the "original" baseline is stuck
 * on the old wrong dates. Result: the Programme overlay's "was" row
 * drifts away from "now" even on plots that have never been delayed.
 *
 * Going forward, the apply-template + cascade code paths refresh
 * originalStartDate whenever startDate changes on a NOT_STARTED job
 * (so the baseline tracks the plan until work actually begins). This
 * one-shot repair brings existing data into line.
 *
 * Safe to re-run — only touches NOT_STARTED jobs that are currently
 * out of sync.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Scanning NOT_STARTED jobs for baseline drift…");

  // Pull every NOT_STARTED job that has dates and a recorded original
  const jobs = await prisma.job.findMany({
    where: {
      status: "NOT_STARTED",
      startDate: { not: null },
      endDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      originalStartDate: true,
      originalEndDate: true,
    },
  });

  console.log(`Considered ${jobs.length} NOT_STARTED jobs.`);

  let drifted = 0;
  const updates: { id: string; startDate: Date; endDate: Date }[] = [];

  for (const j of jobs) {
    const startMs = j.startDate!.getTime();
    const endMs = j.endDate!.getTime();
    const origStartMs = j.originalStartDate?.getTime();
    const origEndMs = j.originalEndDate?.getTime();

    const driftStart = origStartMs !== startMs;
    const driftEnd = origEndMs !== endMs;
    if (!driftStart && !driftEnd) continue;

    drifted++;
    updates.push({ id: j.id, startDate: j.startDate!, endDate: j.endDate! });
  }

  console.log(`Drifted: ${drifted}. Re-baselining…`);

  // Atomic, in chunks to avoid huge tx
  const CHUNK = 100;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((u) =>
        prisma.job.update({
          where: { id: u.id },
          data: {
            originalStartDate: u.startDate,
            originalEndDate: u.endDate,
          },
        }),
      ),
    );
    console.log(`  · re-baselined ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
  }

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
