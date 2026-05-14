/**
 * One-off verification — confirm order line-items, quants and drawings
 * landed on the "2 Story House" base + all 4 variants.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!t) throw new Error("template not found");

  const scopes: Array<{ variantId: string | null; label: string }> = [
    { variantId: null, label: "base" },
    ...t.variants.map((v) => ({ variantId: v.id, label: v.name })),
  ];

  for (const s of scopes) {
    const orders = await prisma.templateOrder.findMany({
      where: { templateJob: { templateId: t.id, variantId: s.variantId } },
      include: { items: true },
    });
    const orderItemCount = orders.reduce((n, o) => n + o.items.length, 0);
    const ordersWithItems = orders.filter((o) => o.items.length > 0).length;
    const quants = await prisma.templateMaterial.findMany({
      where: { templateId: t.id, variantId: s.variantId },
    });
    const docs = await prisma.templateDocument.findMany({
      where: { templateId: t.id, variantId: s.variantId },
    });
    const quantValue = quants.reduce((sum, q) => sum + q.quantity * (q.unitCost ?? 0), 0);

    console.log(`${s.label.padEnd(8)} — orders ${ordersWithItems}/${orders.length} with items (${orderItemCount} line-items), ` +
      `${quants.length} quants (£${quantValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })} material value), ` +
      `${docs.length} drawings (${docs.filter((d) => d.isPlaceholder).length} placeholder)`);
  }

  // Sample detail from the base so the data is visibly real
  console.log(`\n── sample (base) ──`);
  const sampleOrder = await prisma.templateOrder.findFirst({
    where: { templateJob: { templateId: t.id, variantId: null }, itemsDescription: "Felt, batten, tile" },
    include: { items: true, supplier: { select: { name: true } } },
  });
  console.log(`  order "${sampleOrder?.itemsDescription}" (→ ${sampleOrder?.supplier?.name}):`);
  for (const i of sampleOrder?.items ?? []) {
    console.log(`     ${i.quantity} ${i.unit}  ${i.name}  @ £${i.unitCost}`);
  }
  const sampleQuants = await prisma.templateMaterial.findMany({
    where: { templateId: t.id, variantId: null }, take: 4, orderBy: { name: "asc" },
  });
  console.log(`  quants (first 4):`);
  for (const q of sampleQuants) {
    console.log(`     ${q.quantity} ${q.unit}  ${q.name}  [${q.category} → ${q.linkedStageCode}]`);
  }
  const sampleDocs = await prisma.templateDocument.findMany({
    where: { templateId: t.id, variantId: null }, take: 3,
  });
  console.log(`  drawings (first 3):`);
  for (const d of sampleDocs) {
    console.log(`     ${d.name}  (${d.fileName}, placeholder=${d.isPlaceholder})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
