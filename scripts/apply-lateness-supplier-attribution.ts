/**
 * (May 2026 audit S-P1 / FC-P0) Add `LatenessEvent.attributedSupplierId`
 * + FK + index.
 *
 * Pre-fix only `attributedContactId` existed, pointed at the Contact
 * table. Material suppliers (Travis Perkins, Howdens) live in a
 * separate Supplier table — the cron auto-attributes order-driven
 * lateness via `order.contactId` but most orders don't have a
 * Contact assigned, so the Analytics widget's "Lateness attributed
 * to contractor / supplier" section was near-empty for the largest
 * lateness bucket.
 *
 * After this migration the schema knows both kinds. UI lets the
 * manager pick a Contractor (Contact) or a Supplier; analytics
 * sums across both. A future refactor will unify Supplier into
 * Contact and collapse the two fields back into one.
 *
 * Idempotent — uses IF NOT EXISTS on each statement.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding LatenessEvent.attributedSupplierId…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LatenessEvent"
    ADD COLUMN IF NOT EXISTS "attributedSupplierId" TEXT;
  `);

  console.log("Adding FK constraint…");
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'LatenessEvent_attributedSupplierId_fkey'
      ) THEN
        ALTER TABLE "LatenessEvent"
        ADD CONSTRAINT "LatenessEvent_attributedSupplierId_fkey"
        FOREIGN KEY ("attributedSupplierId") REFERENCES "Supplier"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log("Adding index…");
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LatenessEvent_attributedSupplierId_idx"
    ON "LatenessEvent"("attributedSupplierId");
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
