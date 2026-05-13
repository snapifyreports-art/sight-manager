/**
 * (May 2026 audit S-P0) Convert defensive FK constraints from
 * onDelete: Cascade to onDelete: SetNull on records that hold
 * audit / financial / compliance evidence.
 *
 * Pre-fix: deleting a Job, Plot, Site, or Contact would silently
 * wipe DELIVERED MaterialOrders + their items + every LatenessEvent
 * attached to them. Cascade-wipe SiteDocuments meant Contact delete
 * destroyed RAMS / method statements / compliance evidence.
 *
 * After: the same delete leaves the orphan rows in place with their
 * parent FK = NULL. UI shows "(deleted job)" / "(contact archived)"
 * but financials + audit trail + compliance survive.
 *
 * Idempotent — re-running just sets ON DELETE SET NULL again with
 * no data change. Existing rows are unaffected; only the constraint
 * behaviour changes.
 *
 * Tables touched:
 *   MaterialOrder.jobId        Cascade -> SetNull
 *   MaterialOrder.plotId       Cascade -> SetNull
 *   MaterialOrder.siteId       Cascade -> SetNull
 *   SiteDocument.siteId        Cascade -> SetNull
 *   SiteDocument.contactId     Cascade -> SetNull
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ConstraintFix {
  label: string;
  table: string;
  column: string;
  references: string;
  /** Postgres-style constraint name. Prisma names them <table>_<col>_fkey. */
  constraintName: string;
}

const fixes: ConstraintFix[] = [
  {
    label: "MaterialOrder.jobId",
    table: "MaterialOrder",
    column: "jobId",
    references: '"Job"("id")',
    constraintName: "MaterialOrder_jobId_fkey",
  },
  {
    label: "MaterialOrder.plotId",
    table: "MaterialOrder",
    column: "plotId",
    references: '"Plot"("id")',
    constraintName: "MaterialOrder_plotId_fkey",
  },
  {
    label: "MaterialOrder.siteId",
    table: "MaterialOrder",
    column: "siteId",
    references: '"Site"("id")',
    constraintName: "MaterialOrder_siteId_fkey",
  },
  {
    label: "SiteDocument.siteId",
    table: "SiteDocument",
    column: "siteId",
    references: '"Site"("id")',
    constraintName: "SiteDocument_siteId_fkey",
  },
  {
    label: "SiteDocument.contactId",
    table: "SiteDocument",
    column: "contactId",
    references: '"Contact"("id")',
    constraintName: "SiteDocument_contactId_fkey",
  },
];

async function main() {
  for (const fix of fixes) {
    process.stdout.write(`  · ${fix.label}… `);
    // Drop the existing FK constraint (it's CASCADE) and recreate as
    // SET NULL. Use a transaction so the table is never left without
    // a constraint.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `ALTER TABLE "${fix.table}" DROP CONSTRAINT IF EXISTS "${fix.constraintName}";`,
      ),
      prisma.$executeRawUnsafe(
        `ALTER TABLE "${fix.table}" ADD CONSTRAINT "${fix.constraintName}" FOREIGN KEY ("${fix.column}") REFERENCES ${fix.references} ON DELETE SET NULL ON UPDATE CASCADE;`,
      ),
    ]);
    console.log("ok");
  }
  console.log(`\nApplied ${fixes.length} FK changes — Cascade → SetNull.`);
  console.log(
    "Existing data unchanged; only the constraint behaviour for future DELETE operations changed.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
