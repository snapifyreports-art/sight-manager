/**
 * (May 2026 audit #175 + #169 + #177) Apply PreStartCheck +
 * Variation + DefectReport tables, plus their enum types.
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating enum types if missing…");
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VariationStatus') THEN
        CREATE TYPE "VariationStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','IMPLEMENTED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DefectReportStatus') THEN
        CREATE TYPE "DefectReportStatus" AS ENUM ('REPORTED','IN_PROGRESS','RESOLVED','CLOSED');
      END IF;
    END$$;
  `);

  console.log("Creating PreStartCheck…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PreStartCheck" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "checked" BOOLEAN NOT NULL DEFAULT FALSE,
      "checkedAt" TIMESTAMP(3),
      "checkedById" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PreStartCheck_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreStartCheck_plotId_sortOrder_idx" ON "PreStartCheck"("plotId","sortOrder");`);

  console.log("Creating Variation…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Variation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "ref" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "requestedBy" TEXT,
      "costDelta" DOUBLE PRECISION,
      "daysDelta" INTEGER,
      "status" "VariationStatus" NOT NULL DEFAULT 'REQUESTED',
      "approvedById" TEXT,
      "approvedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Variation_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Variation_plotId_idx" ON "Variation"("plotId");`);

  console.log("Creating DefectReport…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DefectReport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "plotId" TEXT NOT NULL,
      "ref" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "status" "DefectReportStatus" NOT NULL DEFAULT 'REPORTED',
      "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt" TIMESTAMP(3),
      "reportedById" TEXT,
      "resolvedById" TEXT,
      "contractorId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DefectReport_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DefectReport_plotId_status_idx" ON "DefectReport"("plotId","status");`);

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
