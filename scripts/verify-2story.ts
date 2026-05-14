/**
 * One-off verification — confirm the "2 Story House" base template's
 * missing data is filled and all 4 variants are present + correct.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!t) throw new Error("template not found");

  // ── base ──────────────────────────────────────────────────────────
  const base = await prisma.templateJob.findMany({
    where: { templateId: t.id, variantId: null },
    include: { orders: true, contact: { select: { name: true } } },
  });
  const noCode = base.filter((j) => !j.stageCode);
  const noDesc = base.filter((j) => !j.description);
  const noContact = base.filter((j) => !j.contactId);
  const orders = base.flatMap((j) => j.orders);
  const noSupplier = orders.filter((o) => !o.supplierId);

  console.log(`BASE  (${base.length} jobs, ${orders.length} orders)`);
  console.log(`  missing stageCode:   ${noCode.length}`);
  console.log(`  missing description: ${noDesc.length}`);
  console.log(`  missing contractor:  ${noContact.length}  ${noContact.length ? `→ ${noContact.map((j) => j.name).join(", ")}` : ""}`);
  console.log(`  missing supplier:    ${noSupplier.length}`);
  console.log(`  sample contractors:  ${base.filter((j) => j.contact).slice(0, 4).map((j) => `${j.name}=${j.contact!.name}`).join("  ")}`);

  // ── variants ──────────────────────────────────────────────────────
  console.log(`\nVARIANTS (${t.variants.length}):`);
  for (const v of t.variants) {
    const vjobs = await prisma.templateJob.findMany({
      where: { templateId: t.id, variantId: v.id },
    });
    const vorders = await prisma.templateOrder.count({
      where: { templateJob: { templateId: t.id, variantId: v.id } },
    });
    const leaves = vjobs.filter((j) => !vjobs.some((c) => c.parentId === j.id));
    const stages = vjobs.filter((j) => !j.parentId);
    const lastWeek = Math.max(...vjobs.map((j) => j.endWeek));

    if (v.name === "1 day") {
      const leafDurs = [...new Set(leaves.map((l) => l.durationDays))];
      const allOneDay = leaves.every((l) => l.durationDays === 1);
      console.log(`  "${v.name}"  — ${vjobs.length} jobs, ${vorders} orders, ${stages.length} stages`);
      console.log(`      leaf durationDays values: [${leafDurs.join(", ")}]  →  all 1 day? ${allOneDay ? "YES ✓" : "NO ✗"}`);
      console.log(`      build spans weeks 1–${lastWeek}  (base spans 1–13)`);
    } else {
      console.log(`  "${v.name}"  — ${vjobs.length} jobs, ${vorders} orders, ${stages.length} stages, spans weeks 1–${lastWeek}`);
    }
  }

  // ── archived sanity check ─────────────────────────────────────────
  const archived = await prisma.plotTemplate.count({ where: { archivedAt: { not: null } } });
  console.log(`\n(archived templates untouched: ${archived})`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
