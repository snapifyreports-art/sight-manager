/**
 * (May 2026 audit P-* and S-P1) Add indexes flagged by the
 * performance + schema audits as missing on hot-query fields.
 *
 * Idempotent — each CREATE INDEX uses IF NOT EXISTS so re-running
 * is safe. Naming follows Postgres convention `<Table>_<col>_idx`.
 *
 * Fields covered:
 *   Job — startDate, endDate, actualEndDate, (plotId, status)
 *   MaterialOrder — dateOfOrder, deliveredDate, contactId
 *   Snag — createdAt, resolvedAt
 *   JobPhoto — createdAt
 *   Site — status
 *   PlotMaterial — plotId (audit found it had no index at all)
 *
 * Schema.prisma is updated separately so Prisma's generated client
 * type matches and future `prisma db push` is a no-op. The two stay
 * in sync — touch one, touch the other.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements: Array<{ name: string; sql: string }> = [
  // Job — date filters appear on every Daily Brief / Programme query
  {
    name: "Job_startDate_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Job_startDate_idx" ON "Job"("startDate")`,
  },
  {
    name: "Job_endDate_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Job_endDate_idx" ON "Job"("endDate")`,
  },
  {
    name: "Job_actualEndDate_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Job_actualEndDate_idx" ON "Job"("actualEndDate")`,
  },
  {
    name: "Job_plotId_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Job_plotId_status_idx" ON "Job"("plotId", "status")`,
  },

  // MaterialOrder — cash-flow + supplier-perf queries filter on these
  {
    name: "MaterialOrder_dateOfOrder_idx",
    sql: `CREATE INDEX IF NOT EXISTS "MaterialOrder_dateOfOrder_idx" ON "MaterialOrder"("dateOfOrder")`,
  },
  {
    name: "MaterialOrder_deliveredDate_idx",
    sql: `CREATE INDEX IF NOT EXISTS "MaterialOrder_deliveredDate_idx" ON "MaterialOrder"("deliveredDate")`,
  },
  {
    name: "MaterialOrder_contactId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "MaterialOrder_contactId_idx" ON "MaterialOrder"("contactId")`,
  },

  // Snag — "stale snags > 30d" + resolution-time queries
  {
    name: "Snag_createdAt_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Snag_createdAt_idx" ON "Snag"("createdAt")`,
  },
  {
    name: "Snag_resolvedAt_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Snag_resolvedAt_idx" ON "Snag"("resolvedAt")`,
  },

  // JobPhoto — photo grid ordered by createdAt DESC on every plot
  {
    name: "JobPhoto_createdAt_idx",
    sql: `CREATE INDEX IF NOT EXISTS "JobPhoto_createdAt_idx" ON "JobPhoto"("createdAt")`,
  },

  // Site — `status: { not: COMPLETED }` is the most common Site filter
  {
    name: "Site_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "Site_status_idx" ON "Site"("status")`,
  },

  // PlotMaterial — had no index at all; plotId is filtered on every
  // budget / plot detail / handover query
  {
    name: "PlotMaterial_plotId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "PlotMaterial_plotId_idx" ON "PlotMaterial"("plotId")`,
  },
];

async function main() {
  for (const stmt of statements) {
    process.stdout.write(`  · ${stmt.name}… `);
    await prisma.$executeRawUnsafe(stmt.sql);
    console.log("ok");
  }
  console.log(`\nApplied ${statements.length} indexes (idempotent).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
