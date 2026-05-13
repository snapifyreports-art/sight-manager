/**
 * (May 2026 Keith bug report) Restore Keith's accidentally-archived
 * templates. He clicked "delete", the soft-archive stamped archivedAt,
 * the settings page didn't filter archived (= they kept reappearing),
 * but the wizard correctly hid them — making it look like creation
 * picker dropped them. Un-archive all PlotTemplate rows to get him
 * back to a working state.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.plotTemplate.updateMany({
    where: { archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  console.log(`Restored ${result.count} archived templates.`);
}
main().finally(() => prisma.$disconnect());
