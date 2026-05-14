/**
 * One-off diagnostic — find "orphaned" MaterialOrders: rows whose
 * job AND site AND plot links are all null. These are left behind
 * when a job/plot/site is hard-deleted (FK onDelete: SetNull). They
 * keep their status + delivery dates, so operational nag-lists
 * (notifications cron, daily brief, /api/tasks) still count them.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.materialOrder.findMany({
    where: { jobId: null, siteId: null, plotId: null },
    include: { supplier: { select: { name: true, archivedAt: true } }, orderItems: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(`ORPHANED ORDERS (no job, no site, no plot): ${orphans.length}\n`);
  for (const o of orphans) {
    console.log(
      `  ${o.id.slice(-6)}  status=${o.status}  ` +
      `dateOfOrder=${o.dateOfOrder.toISOString().slice(0, 10)}  ` +
      `expDelivery=${o.expectedDeliveryDate?.toISOString().slice(0, 10) ?? "—"}  ` +
      `delivered=${o.deliveredDate?.toISOString().slice(0, 10) ?? "—"}  ` +
      `supplier=${o.supplier?.name ?? "∅"}${o.supplier?.archivedAt ? " (ARCHIVED)" : ""}  ` +
      `items="${o.itemsDescription ?? (o.orderItems.map((i) => i.name).join(", ") || "∅")}"`,
    );
  }

  // How many of these would show in TODAY's notification cron?
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  const overdueOrphans = orphans.filter(
    (o) => o.status === "ORDERED" && o.expectedDeliveryDate && o.expectedDeliveryDate < todayStart,
  );
  const dueTodayOrphans = orphans.filter(
    (o) => o.status === "ORDERED" && o.expectedDeliveryDate &&
      o.expectedDeliveryDate >= todayStart && o.expectedDeliveryDate < todayEnd,
  );
  const pendingOrphans = orphans.filter((o) => o.status === "PENDING");

  console.log(`\n=== These leak into notifications / daily brief / tasks ===`);
  console.log(`  counted as "Overdue Materials":     ${overdueOrphans.length}`);
  console.log(`  counted as "Deliveries Due Today":  ${dueTodayOrphans.length}`);
  console.log(`  counted as "Orders to Send":        ${pendingOrphans.length}`);

  // Also: orders tied to ARCHIVED suppliers (soft-deleted supplier,
  // order still live) — a different flavour of the same complaint.
  const archivedSupplierOrders = await prisma.materialOrder.count({
    where: { supplier: { archivedAt: { not: null } }, status: { in: ["PENDING", "ORDERED"] } },
  });
  console.log(`\n  live orders against an ARCHIVED supplier:  ${archivedSupplierOrders}`);

  // Total live orders for context
  const totalLive = await prisma.materialOrder.count();
  console.log(`\n  (total MaterialOrder rows in DB: ${totalLive})`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
