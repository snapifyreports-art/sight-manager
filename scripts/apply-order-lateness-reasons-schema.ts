/**
 * (May 2026) Order-lateness reasons + decision schema.
 *
 * Backs the "order sent late" popup and the late-delivery reason picker:
 *
 *   1. DelayReason.scope (TEXT, nullable) — which picker a reason belongs
 *      to. null = the original general/job-delay list (untouched).
 *      "ORDER_SEND" / "ORDER_DELIVERY" = the two new order pickers.
 *      Lets all three contexts share the one self-growing table while
 *      keeping their lists separate — a custom "Other" reason typed in a
 *      picker is upserted here scoped to that picker.
 *
 *   2. LatenessEvent.delayReasonId (TEXT FK → DelayReason) — the
 *      specific, manager-picked reason for order-send / order-delivery
 *      lateness. reasonCode (enum) stays the broad reporting bucket.
 *
 *   3. LatenessEvent.excused (BOOLEAN, default false) — manager marked
 *      the lateness "no programme impact" (e.g. order sent late but the
 *      material wasn't needed early). Recorded for audit, excluded from
 *      the Delay Report's headline counts.
 *
 * Then seeds the two scoped reason lists Keith agreed. Idempotent —
 * IF NOT EXISTS on every DDL statement, upsert on the seed.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The two base lists. "Other" is a UI affordance (free-text → upsert),
// never seeded. category stays OTHER — these aren't weather buckets.
const SEEDS: Array<{ label: string; scope: "ORDER_SEND" | "ORDER_DELIVERY" }> = [
  // Why an order went out late
  { label: "Missed / overlooked it", scope: "ORDER_SEND" },
  { label: "Waiting on budget or PO sign-off", scope: "ORDER_SEND" },
  { label: "Supplier not yet confirmed", scope: "ORDER_SEND" },
  { label: "Spec or drawings not finalised", scope: "ORDER_SEND" },
  { label: "Quantities not confirmed", scope: "ORDER_SEND" },
  { label: "Plot schedule changed", scope: "ORDER_SEND" },
  // Why a delivery was late
  { label: "Supplier out of stock", scope: "ORDER_DELIVERY" },
  { label: "Supplier capacity / backlog", scope: "ORDER_DELIVERY" },
  { label: "Transport / logistics delay", scope: "ORDER_DELIVERY" },
  { label: "Order was sent late (knock-on)", scope: "ORDER_DELIVERY" },
  { label: "Wrong items — reorder needed", scope: "ORDER_DELIVERY" },
  { label: "Weather hit transport", scope: "ORDER_DELIVERY" },
];

async function main() {
  console.log("1/5  DelayReason.scope column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "DelayReason"
    ADD COLUMN IF NOT EXISTS "scope" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DelayReason_scope_idx"
    ON "DelayReason"("scope");
  `);

  console.log("2/5  LatenessEvent.delayReasonId column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LatenessEvent"
    ADD COLUMN IF NOT EXISTS "delayReasonId" TEXT;
  `);

  console.log("3/5  LatenessEvent.delayReasonId FK…");
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'LatenessEvent_delayReasonId_fkey'
      ) THEN
        ALTER TABLE "LatenessEvent"
        ADD CONSTRAINT "LatenessEvent_delayReasonId_fkey"
        FOREIGN KEY ("delayReasonId") REFERENCES "DelayReason"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LatenessEvent_delayReasonId_idx"
    ON "LatenessEvent"("delayReasonId");
  `);

  console.log("4/5  LatenessEvent.excused column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LatenessEvent"
    ADD COLUMN IF NOT EXISTS "excused" BOOLEAN NOT NULL DEFAULT false;
  `);

  console.log("5/5  Seeding scoped order-lateness reasons…");
  for (const seed of SEEDS) {
    await prisma.delayReason.upsert({
      where: { label: seed.label },
      // Re-assert scope + isSystem on re-runs; never clobber usageCount.
      update: { scope: seed.scope, isSystem: true, category: "OTHER" },
      create: {
        label: seed.label,
        category: "OTHER",
        scope: seed.scope,
        isSystem: true,
      },
    });
  }

  const sendCount = await prisma.delayReason.count({ where: { scope: "ORDER_SEND" } });
  const delivCount = await prisma.delayReason.count({ where: { scope: "ORDER_DELIVERY" } });
  console.log(`Done. ${sendCount} send reasons, ${delivCount} delivery reasons seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
