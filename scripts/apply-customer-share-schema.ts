/**
 * Apply the customer-share schema additions via raw SQL on the pooled
 * connection. Direct (port 5432) connection is unreachable from this
 * environment so `prisma db push` fails; raw SQL on the pooled URL
 * still works.
 *
 * Idempotent: every statement uses IF NOT EXISTS / etc. so re-running
 * is a no-op.
 *
 * Adds:
 *   - Plot.shareToken (TEXT, unique, nullable)
 *   - Plot.shareEnabled (BOOLEAN, default true)
 *   - JobPhoto.sharedWithCustomer (BOOLEAN, default false)
 *   - JobPhoto index on (jobId, sharedWithCustomer)
 *   - PlotJournalEntry table + indexes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Applying customer-share schema additions…");

  // 1. Plot.shareToken (unique nullable)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Plot"
    ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Plot_shareToken_key"
      ON "Plot" ("shareToken")
      WHERE "shareToken" IS NOT NULL;
  `);

  // 2. Plot.shareEnabled
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Plot"
    ADD COLUMN IF NOT EXISTS "shareEnabled" BOOLEAN NOT NULL DEFAULT true;
  `);

  // 3. JobPhoto.sharedWithCustomer (default false — opt-in)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "JobPhoto"
    ADD COLUMN IF NOT EXISTS "sharedWithCustomer" BOOLEAN NOT NULL DEFAULT false;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "JobPhoto_jobId_sharedWithCustomer_idx"
      ON "JobPhoto" ("jobId", "sharedWithCustomer");
  `);

  // 4. PlotJournalEntry table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlotJournalEntry" (
      "id" TEXT PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlotJournalEntry_plot_fk"
        FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE,
      CONSTRAINT "PlotJournalEntry_user_fk"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlotJournalEntry_plotId_createdAt_idx"
      ON "PlotJournalEntry" ("plotId", "createdAt");
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
