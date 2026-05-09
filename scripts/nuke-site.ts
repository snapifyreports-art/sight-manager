/**
 * Quick site nuke — delete a site by name. Cascades to plots / jobs /
 * orders / snags / events / documents / handover via the schema's
 * onDelete: Cascade. Use sparingly; this is destructive.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npx tsx scripts/nuke-site.ts "Site Name"');
    process.exit(1);
  }
  const site = await prisma.site.findFirst({
    where: { name },
    include: { _count: { select: { plots: true } } },
  });
  if (!site) {
    console.log(`Site "${name}" not found.`);
    return;
  }
  console.log(
    `Deleting site "${site.name}" (id=${site.id}, ${site._count.plots} plots) …`,
  );
  await prisma.site.delete({ where: { id: site.id } });
  console.log("✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
