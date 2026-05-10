/**
 * (May 2026 audit #57 + #176 + #178) Apply SiteComplianceItem +
 * ToolboxTalk + NCR tables, plus their enum types. Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating enum types if missing…");
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SiteComplianceStatus') THEN
        CREATE TYPE "SiteComplianceStatus" AS ENUM ('PENDING','ACTIVE','EXPIRED','EXEMPT');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NCRStatus') THEN
        CREATE TYPE "NCRStatus" AS ENUM ('OPEN','INVESTIGATING','AWAITING_CORRECTION','RESOLVED','CLOSED');
      END IF;
    END$$;
  `);

  console.log("Creating SiteComplianceItem…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SiteComplianceItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "siteId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "category" TEXT,
      "status" "SiteComplianceStatus" NOT NULL DEFAULT 'PENDING',
      "documentId" TEXT,
      "expiresAt" TIMESTAMP(3),
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SiteComplianceItem_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE,
      CONSTRAINT "SiteComplianceItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SiteDocument"("id") ON DELETE SET NULL
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteComplianceItem_siteId_idx" ON "SiteComplianceItem"("siteId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteComplianceItem_expiresAt_idx" ON "SiteComplianceItem"("expiresAt");`);

  console.log("Creating ToolboxTalk…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ToolboxTalk" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "siteId" TEXT NOT NULL,
      "topic" TEXT NOT NULL,
      "notes" TEXT,
      "attendees" TEXT,
      "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deliveredBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ToolboxTalk_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ToolboxTalk_siteId_deliveredAt_idx" ON "ToolboxTalk"("siteId","deliveredAt");`);

  console.log("Creating NCR…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NCR" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "siteId" TEXT NOT NULL,
      "plotId" TEXT,
      "jobId" TEXT,
      "contactId" TEXT,
      "ref" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "rootCause" TEXT,
      "correctiveAction" TEXT,
      "status" "NCRStatus" NOT NULL DEFAULT 'OPEN',
      "raisedById" TEXT,
      "closedById" TEXT,
      "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NCR_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE,
      CONSTRAINT "NCR_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL,
      CONSTRAINT "NCR_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL,
      CONSTRAINT "NCR_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NCR_siteId_status_idx" ON "NCR"("siteId","status");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NCR_plotId_idx" ON "NCR"("plotId");`);

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
