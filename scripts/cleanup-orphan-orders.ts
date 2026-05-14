/**
 * One-off cleanup — delete contextless orphan MaterialOrders (job AND
 * site AND plot all null). These are leftovers from hard-deleted
 * test sites (MaterialOrder.jobId/siteId/plotId are onDelete:SetNull).
 *
 * Safe: OrderItem cascades on order delete; LatenessEvent.orderId is
 * SetNull so no FK blocks. Approved by Keith (May 2026).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orphanWhere = { jobId: null, siteId: null, plotId: null };

  const before = await prisma.materialOrder.count({ where: orphanWhere });
  const totalBefore = await prisma.materialOrder.count();
  const itemsBefore = await prisma.orderItem.count({
    where: { order: orphanWhere },
  });
  console.log(`Orphan orders to delete: ${before}  (of ${totalBefore} total)`);
  console.log(`Their order items (cascade-deleted): ${itemsBefore}`);

  // Null out any LatenessEvent.orderId pointing at these first — the FK
  // is SetNull so Prisma would do it anyway, but doing it explicitly
  // keeps the delete clean and logs the count.
  const latenessTouched = await prisma.latenessEvent.updateMany({
    where: { order: orphanWhere },
    data: { orderId: null },
  });
  if (latenessTouched.count > 0) {
    console.log(`Detached ${latenessTouched.count} lateness event(s) from orphan orders`);
  }

  const deleted = await prisma.materialOrder.deleteMany({ where: orphanWhere });
  const totalAfter = await prisma.materialOrder.count();

  console.log(`\n✓ Deleted ${deleted.count} orphan orders`);
  console.log(`  MaterialOrder rows remaining: ${totalAfter}`);

  // sanity — should now be zero orphans
  const stillOrphan = await prisma.materialOrder.count({ where: orphanWhere });
  console.log(`  orphans remaining: ${stillOrphan}  ${stillOrphan === 0 ? "✓" : "✗ UNEXPECTED"}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); }).finally(() => prisma.$disconnect());
