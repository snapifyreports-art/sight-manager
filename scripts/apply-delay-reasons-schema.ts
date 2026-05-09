/**
 * Apply DelayReason table + seed common reasons. Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seeded reasons — Keith's brief plus a few obvious extras. Order
// here is the initial display order before usageCount accumulates.
// `category` is the Delay Report bucket: WEATHER_RAIN | WEATHER_TEMPERATURE
// | OTHER. Match against EventLog.delayReasonType.
const SEEDS: Array<{ label: string; category: "WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER" }> = [
  { label: "Rain", category: "WEATHER_RAIN" },
  { label: "Temperature", category: "WEATHER_TEMPERATURE" },
  { label: "Contractor no-show", category: "OTHER" },
  { label: "Order delay", category: "OTHER" },
  { label: "Delivery late", category: "OTHER" },
  { label: "Material missing", category: "OTHER" },
  { label: "Snag rework", category: "OTHER" },
  { label: "Plant breakdown", category: "OTHER" },
  { label: "Site access", category: "OTHER" },
];

async function main() {
  console.log("Creating DelayReason table…");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DelayReason" (
      "id" TEXT PRIMARY KEY,
      "label" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'OTHER',
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "isSystem" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastUsedAt" TIMESTAMP(3)
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DelayReason_label_key"
      ON "DelayReason" ("label");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DelayReason_usageCount_idx"
      ON "DelayReason" ("usageCount");
  `);

  console.log("Seeding common reasons…");
  for (const seed of SEEDS) {
    await prisma.delayReason.upsert({
      where: { label: seed.label },
      // Don't overwrite existing usageCount on re-runs — system flag is the only thing we re-assert.
      update: { isSystem: true, category: seed.category },
      create: {
        label: seed.label,
        category: seed.category,
        isSystem: true,
      },
    });
  }

  const count = await prisma.delayReason.count();
  console.log(`Done. ${count} reasons in DelayReason table.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
