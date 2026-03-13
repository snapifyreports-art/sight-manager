import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.findFirst({ where: { name: 'Riverside Gardens' } });
  if (!site) return;
  const plots = await prisma.plot.findMany({
    where: { siteId: site.id },
    include: { jobs: { orderBy: { sortOrder: 'asc' } } },
  });
  const admin = await prisma.user.findFirst({ where: { email: 'ross@sightmanager.com' } });
  const supplier = await prisma.supplier.findFirst();
  if (!admin || !supplier) return;

  // Kitchen order for Plot 1
  await prisma.materialOrder.create({
    data: {
      jobId: plots[0].jobs[17].id,
      supplierId: supplier.id,
      status: 'PENDING',
      dateOfOrder: new Date('2026-02-20'),
      expectedDeliveryDate: new Date('2026-03-10'),
      orderDetails: 'Kitchen units for Plot 1 - white gloss handleless range',

    },
  });
  console.log('Kitchen order created');

  // Plasterboard order
  const plasterOrder = await prisma.materialOrder.create({
    data: {
      jobId: plots[0].jobs[13].id,
      supplierId: supplier.id,
      status: 'DELIVERED',
      dateOfOrder: new Date('2026-02-15'),
      expectedDeliveryDate: new Date('2026-02-22'),
      deliveredDate: new Date('2026-02-21'),
      orderDetails: 'Plasterboard and skim for Plots 1-2',

    },
  });
  await prisma.orderItem.create({
    data: { orderId: plasterOrder.id, name: 'Plasterboard 2400x1200x12.5mm', quantity: 120, unit: 'sheets', unitCost: 8.50 },
  });
  await prisma.orderItem.create({
    data: { orderId: plasterOrder.id, name: 'Multi-finish plaster 25kg', quantity: 40, unit: 'bags', unitCost: 12.80 },
  });
  console.log('Plasterboard order created');

  // Bricks order
  const brickOrder = await prisma.materialOrder.create({
    data: {
      jobId: plots[2].jobs[5].id,
      supplierId: supplier.id,
      status: 'DELIVERED',
      dateOfOrder: new Date('2026-01-20'),
      expectedDeliveryDate: new Date('2026-02-01'),
      deliveredDate: new Date('2026-02-03'),
      orderDetails: 'Red multi facing bricks for Plots 3-6',

    },
  });
  await prisma.orderItem.create({
    data: { orderId: brickOrder.id, name: 'Red Multi Facing Brick', quantity: 15000, unit: 'bricks', unitCost: 0.45 },
  });
  console.log('Bricks order created');

  // Also add remaining snags
  await prisma.snag.create({
    data: {
      plotId: plots[1].id,
      description: 'First fix plumbing - waste pipe fall insufficient in downstairs WC. Needs re-routing.',
      location: 'Ground floor WC',
      priority: 'HIGH',
      status: 'OPEN',
      raisedById: admin.id,
      assignedToId: admin.id,
    },
  });
  await prisma.snag.create({
    data: {
      plotId: plots[4].id,
      description: 'Window unit delivered scratched on external face. Replacement needed.',
      location: 'Rear elevation, bedroom 2 window',
      priority: 'LOW',
      status: 'OPEN',
      raisedById: admin.id,
      notes: 'Supplier notified. Replacement ETA 2 weeks.',
    },
  });
  await prisma.snag.create({
    data: {
      plotId: plots[0].id,
      description: 'Plaster cracking in lounge above window. Likely due to lintel movement.',
      location: 'Lounge, above front window',
      priority: 'CRITICAL',
      status: 'OPEN',
      raisedById: admin.id,
      assignedToId: admin.id,
      notes: 'Related to cracked lintel snag. Structural engineer review needed.',
    },
  });
  console.log('Additional snags created');

  // Summary
  const total = await prisma.job.count({ where: { plot: { siteId: site.id } } });
  const completed = await prisma.job.count({ where: { plot: { siteId: site.id }, status: 'COMPLETED' } });
  const inProgress = await prisma.job.count({ where: { plot: { siteId: site.id }, status: 'IN_PROGRESS' } });
  const snags = await prisma.snag.count({ where: { plot: { siteId: site.id } } });
  const orders = await prisma.materialOrder.count({ where: { job: { plot: { siteId: site.id } } } });

  console.log(`\n=== SIMULATION SUMMARY ===`);
  console.log(`Jobs: ${completed} completed, ${inProgress} in progress, ${total - completed - inProgress} not started`);
  console.log(`Snags: ${snags}`);
  console.log(`Orders: ${orders}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
