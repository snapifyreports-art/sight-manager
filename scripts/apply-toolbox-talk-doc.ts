/**
 * (#175) Add document-attachment fields to ToolboxTalk so each talk
 * can carry one optional file (signed register, slide deck, RAMS).
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding ToolboxTalk.documentUrl, documentFileName, documentSize, documentMimeType…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ToolboxTalk" ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ToolboxTalk" ADD COLUMN IF NOT EXISTS "documentFileName" TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ToolboxTalk" ADD COLUMN IF NOT EXISTS "documentSize" INTEGER;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ToolboxTalk" ADD COLUMN IF NOT EXISTS "documentMimeType" TEXT;`,
  );
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
