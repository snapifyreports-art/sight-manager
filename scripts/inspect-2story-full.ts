/**
 * One-off deep inspection of the live "2 Story House" template — dump
 * every job + order + material + document with all fields so we can
 * see exactly what data is missing before filling it.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
  });
  if (!t) {
    console.log("No live '2 Story House' template found");
    return;
  }
  console.log(`TEMPLATE: ${t.name}`);
  console.log(`  id=${t.id}  typeLabel=${t.typeLabel}  isDraft=${t.isDraft}\n`);

  const jobs = await prisma.templateJob.findMany({
    where: { templateId: t.id, variantId: null },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    include: { orders: { include: { items: true } }, contact: true },
  });
  const parents = jobs.filter((j) => !j.parentId);
  const childrenOf = (pid: string) => jobs.filter((j) => j.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder);

  let missingStage = 0, missingDur = 0, missingContact = 0, missingDesc = 0;
  let ordersNoSupplier = 0, ordersNoItems = 0, ordersNoLead = 0;

  for (const p of parents) {
    console.log(`\n■ STAGE: ${p.name}  [w${p.startWeek}-${p.endWeek}]  stageCode=${p.stageCode ?? "∅"}  durWk=${p.durationWeeks ?? "∅"} durDy=${p.durationDays ?? "∅"}  weather=${p.weatherAffected}/${p.weatherAffectedType ?? "∅"}  contractor=${p.contact?.name ?? "∅"}  desc=${p.description ? "✓" : "∅"}`);
    if (!p.stageCode) missingStage++;
    if (p.durationWeeks == null && p.durationDays == null) missingDur++;
    if (!p.contactId) missingContact++;
    if (!p.description) missingDesc++;
    for (const o of p.orders) {
      console.log(`    ORDER: supplier=${o.supplierId ?? "∅"}  items="${o.itemsDescription ?? "∅"}"  lead=${o.leadTimeAmount ?? "∅"}${o.leadTimeUnit ?? ""}  anchor=${o.anchorType ?? "∅"}  lineItems=${o.items.length}`);
      if (!o.supplierId) ordersNoSupplier++;
      if (!o.itemsDescription && o.items.length === 0) ordersNoItems++;
      if (o.leadTimeAmount == null) ordersNoLead++;
    }
    for (const c of childrenOf(p.id)) {
      console.log(`    └─ ${c.name}  [w${c.startWeek}-${c.endWeek}]  stageCode=${c.stageCode ?? "∅"}  durWk=${c.durationWeeks ?? "∅"} durDy=${c.durationDays ?? "∅"}  weather=${c.weatherAffected}/${c.weatherAffectedType ?? "∅"}  contractor=${c.contact?.name ?? "∅"}  desc=${c.description ? "✓" : "∅"}`);
      if (!c.stageCode) missingStage++;
      if (c.durationWeeks == null && c.durationDays == null) missingDur++;
      if (!c.contactId) missingContact++;
      if (!c.description) missingDesc++;
      for (const o of c.orders) {
        console.log(`        ORDER: supplier=${o.supplierId ?? "∅"}  items="${o.itemsDescription ?? "∅"}"  lead=${o.leadTimeAmount ?? "∅"}${o.leadTimeUnit ?? ""}  anchor=${o.anchorType ?? "∅"}  lineItems=${o.items.length}`);
        if (!o.supplierId) ordersNoSupplier++;
        if (!o.itemsDescription && o.items.length === 0) ordersNoItems++;
        if (o.leadTimeAmount == null) ordersNoLead++;
      }
    }
  }

  const materials = await prisma.templateMaterial.count({ where: { templateId: t.id, variantId: null } });
  const documents = await prisma.templateDocument.count({ where: { templateId: t.id, variantId: null } });
  const totalJobs = jobs.length;

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`  total jobs (parent+child): ${totalJobs}  (${parents.length} stages)`);
  console.log(`  jobs missing stageCode:    ${missingStage}`);
  console.log(`  jobs missing duration:     ${missingDur}`);
  console.log(`  jobs missing contractor:   ${missingContact}`);
  console.log(`  jobs missing description:  ${missingDesc}`);
  console.log(`  orders missing supplier:   ${ordersNoSupplier}`);
  console.log(`  orders missing items:      ${ordersNoItems}`);
  console.log(`  orders missing lead time:  ${ordersNoLead}`);
  console.log(`  materials (quants):        ${materials}`);
  console.log(`  documents:                 ${documents}`);
}
main().finally(() => prisma.$disconnect());
