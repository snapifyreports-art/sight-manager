/**
 * (May 2026 Keith request) House value — two figures per house:
 *   buildBudget = target build cost
 *   salePrice   = GDV the finished home sells for
 *
 * Lives on PlotTemplate (base default), TemplateVariant (per-size
 * override — variants are different sq-ft), and Plot (snapshotted from
 * whichever applied; editable per-plot). The Budget report compares
 * actual spend against buildBudget, and salePrice for the margin view.
 *
 * Marking a template live now requires the base + every variant to
 * carry both figures — enforced in the go-live transition, not here.
 *
 * Idempotent — ADD COLUMN IF NOT EXISTS on each.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (const table of ["PlotTemplate", "TemplateVariant", "Plot"]) {
    console.log(`Adding ${table}.buildBudget + ${table}.salePrice…`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "${table}"
      ADD COLUMN IF NOT EXISTS "buildBudget" DOUBLE PRECISION;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "${table}"
      ADD COLUMN IF NOT EXISTS "salePrice" DOUBLE PRECISION;
    `);
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
