/**
 * Diagnostic — print every TemplateVariant + its parent template.
 * Used to investigate Keith's report that variants don't show up in
 * the create-site wizard.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.plotTemplate.findMany({
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      _count: { select: { jobs: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const t of templates) {
    console.log(
      `\n· "${t.name}"  isDraft=${t.isDraft}  archivedAt=${t.archivedAt ? "ARCHIVED" : "null"}  jobs=${t._count.jobs}`,
    );
    if (t.variants.length === 0) {
      console.log("    (no variants)");
    } else {
      for (const v of t.variants) {
        console.log(`    - variant "${v.name}"  id=${v.id}  sortOrder=${v.sortOrder}`);
      }
    }
  }
}
main().finally(() => prisma.$disconnect());
