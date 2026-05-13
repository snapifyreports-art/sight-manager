/**
 * One-off diagnostic — print the current state of every PlotTemplate
 * so we can see if Keith's templates are Live + un-archived (= should
 * appear in wizard) or in some other state.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.plotTemplate.findMany({
    include: { _count: { select: { jobs: true, variants: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Found ${all.length} plot templates total:\n`);
  for (const t of all) {
    console.log(
      `  · ${t.name}  isDraft=${t.isDraft}  archivedAt=${t.archivedAt ? "ARCHIVED" : "null"}  jobs=${t._count.jobs}  variants=${t._count.variants}`,
    );
  }
}
main().finally(() => prisma.$disconnect());
