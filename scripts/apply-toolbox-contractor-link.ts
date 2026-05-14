/**
 * (May 2026 Keith request) ToolboxTalk.contractorIds — a text array of
 * Contact ids for the contractors who attended a toolbox talk. Lets a
 * talk be linked to contractors (so it shows in their Contractor Comms)
 * while the free-text `attendees` field stays for ad-hoc worker names.
 *
 * Text array rather than a join table: Contacts are soft-deleted, so an
 * id stored here stays resolvable; the contractor-comms read filters
 * with `contractorIds has <contactId>`. Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding ToolboxTalk.contractorIds…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ToolboxTalk"
    ADD COLUMN IF NOT EXISTS "contractorIds" TEXT[] NOT NULL DEFAULT '{}';
  `);

  // GIN index — the contractor-comms query does `contractorIds has <id>`
  // (array containment), which a GIN index serves efficiently.
  console.log("Adding GIN index for array containment…");
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ToolboxTalk_contractorIds_idx"
    ON "ToolboxTalk" USING GIN ("contractorIds");
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
