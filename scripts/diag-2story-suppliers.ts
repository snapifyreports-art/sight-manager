/**
 * Diagnostic — why is the create-site wizard still showing the supplier
 * step for the "2 Story House" template (and its "1 day" variant)?
 *
 * The wizard gates Step 3 on the BASE template's orders only (the
 * /api/plot-templates fetch uses templateJobsInclude → variantId: null).
 * So we dump base order supplier coverage AND every variant's order
 * supplier coverage to see exactly where the gap is.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function dumpScope(templateId: string, variantId: string | null, label: string) {
  const jobs = await prisma.templateJob.findMany({
    where: { templateId, variantId },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    include: { orders: { include: { supplier: { select: { name: true } } } } },
  });
  const orders = jobs.flatMap((j) =>
    j.orders.map((o) => ({ job: j.name, o })),
  );
  const noSupplier = orders.filter((r) => !r.o.supplierId);
  console.log(`\n=== ${label} ===`);
  console.log(`  jobs: ${jobs.length}   orders: ${orders.length}   orders WITHOUT supplier: ${noSupplier.length}`);
  for (const r of orders) {
    const sup = r.o.supplierId ? (r.o.supplier?.name ?? r.o.supplierId) : "∅ NONE";
    console.log(`    [${r.o.supplierId ? "OK" : "!!"}] ${r.job}  ::  "${r.o.itemsDescription ?? "(no desc)"}"  ->  ${sup}`);
  }
}

async function main() {
  const t = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!t) {
    console.log("No live '2 Story House' template found");
    return;
  }
  console.log(`TEMPLATE: ${t.name}   id=${t.id}   variants: ${t.variants.length}`);

  await dumpScope(t.id, null, "BASE (what the wizard gates on)");
  for (const v of t.variants) {
    await dumpScope(t.id, v.id, `VARIANT "${v.name}"  (id=${v.id})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
