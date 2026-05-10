/**
 * (May 2026 audit #201) Add SUPER_ADMIN to UserRole enum.
 * Idempotent — uses ADD VALUE IF NOT EXISTS.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding SUPER_ADMIN to UserRole enum…");
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'CEO';`,
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
