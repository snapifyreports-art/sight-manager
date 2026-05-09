/**
 * Backfill any null originalStartDate / originalEndDate from current
 * startDate / endDate, then make those columns NOT NULL via raw SQL
 * on the pooled connection.
 *
 * Why: reports (cash-flow, daily-brief delayed-jobs filter, etc.) had
 * to fall back to current dates when originals were null, which
 * silently mixed modes per-job. Schema tightening + backfill kills
 * the fallback path forever.
 *
 * Idempotent — re-running is safe.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Backfilling null originalStartDate / originalEndDate…");

  // Backfill any nulls from the live startDate / endDate. Field-to-field
  // copy isn't supported by Prisma's typed client so use raw SQL.
  const sBackfill = await prisma.$executeRawUnsafe(`
    UPDATE "Job"
    SET "originalStartDate" = "startDate"
    WHERE "originalStartDate" IS NULL AND "startDate" IS NOT NULL;
  `);
  console.log(`  · originalStartDate backfilled rows: ${sBackfill}`);

  const eBackfill = await prisma.$executeRawUnsafe(`
    UPDATE "Job"
    SET "originalEndDate" = "endDate"
    WHERE "originalEndDate" IS NULL AND "endDate" IS NOT NULL;
  `);
  console.log(`  · originalEndDate backfilled rows: ${eBackfill}`);

  // Any rows that have null originals AND null startDate/endDate are
  // pathological — log + skip rather than fail the whole migration.
  const stragglers = await prisma.job.count({
    where: {
      OR: [
        { originalStartDate: null },
        { originalEndDate: null },
      ],
    },
  });
  if (stragglers > 0) {
    console.warn(
      `  ! ${stragglers} jobs still have null originals because their startDate/endDate is also null. Skipping NOT NULL — these need manual repair first.`,
    );
    console.warn(`  ! Listing first 10 …`);
    const sample = await prisma.job.findMany({
      where: {
        OR: [
          { originalStartDate: null },
          { originalEndDate: null },
        ],
      },
      take: 10,
      select: { id: true, name: true, plotId: true, status: true },
    });
    for (const j of sample) console.warn(`    · ${j.id} (${j.name}) plot=${j.plotId} status=${j.status}`);
    return;
  }

  console.log("Tightening columns to NOT NULL…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Job"
      ALTER COLUMN "originalStartDate" SET NOT NULL;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Job"
      ALTER COLUMN "originalEndDate" SET NOT NULL;
  `);

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
