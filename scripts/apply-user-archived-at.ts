/**
 * (May 2026 audit S-P0 / B-P1-3) Add `User.archivedAt` for soft-delete /
 * offboard flow.
 *
 * Pre-fix every User FK was Restrict, so once a user had any activity
 * (signed off a job, raised a snag, etc.) you could not delete them.
 * Admins resorted to renaming the user to "Sarah (left)" or changing
 * the password — informal patterns that left the picker UIs full of
 * ex-staff.
 *
 * After: `archivedAt: DateTime?` column. Admins click "Archive user"
 * → field stamped → auth callback rejects login → user filtered out
 * of every picker (assignee select, watch list, etc.). Historical
 * EventLog / JobAction / SignedOffBy attribution all survive with
 * full names intact.
 *
 * Idempotent — uses IF NOT EXISTS.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding User.archivedAt column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
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
