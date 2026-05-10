/**
 * (May 2026 audit #166 + #49 + #50) Apply PlotDrawSchedule + VoiceNote
 * + PhotoAnnotation tables. Idempotent raw-SQL pattern.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating enum if missing…");
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlotDrawStatus') THEN
        CREATE TYPE "PlotDrawStatus" AS ENUM ('SCHEDULED','DUE','PAID','WAIVED');
      END IF;
    END$$;
  `);

  console.log("Creating PlotDrawSchedule…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlotDrawSchedule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "triggerJobId" TEXT,
      "dueAt" TIMESTAMP(3),
      "status" "PlotDrawStatus" NOT NULL DEFAULT 'SCHEDULED',
      "paidAt" TIMESTAMP(3),
      "paidById" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlotDrawSchedule_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlotDrawSchedule_plotId_sortOrder_idx" ON "PlotDrawSchedule"("plotId","sortOrder");`);

  console.log("Creating VoiceNote…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VoiceNote" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "jobId" TEXT,
      "snagId" TEXT,
      "url" TEXT NOT NULL,
      "durationSec" INTEGER,
      "caption" TEXT,
      "transcript" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdById" TEXT,
      CONSTRAINT "VoiceNote_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VoiceNote_plotId_createdAt_idx" ON "VoiceNote"("plotId","createdAt");`);

  console.log("Creating PhotoAnnotation…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PhotoAnnotation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "jobPhotoId" TEXT NOT NULL,
      "plotId" TEXT NOT NULL,
      "strokes" TEXT NOT NULL,
      "caption" TEXT,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PhotoAnnotation_jobPhotoId_fkey" FOREIGN KEY ("jobPhotoId") REFERENCES "JobPhoto"("id") ON DELETE CASCADE,
      CONSTRAINT "PhotoAnnotation_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PhotoAnnotation_jobPhotoId_idx" ON "PhotoAnnotation"("jobPhotoId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PhotoAnnotation_plotId_idx" ON "PhotoAnnotation"("plotId");`);

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
