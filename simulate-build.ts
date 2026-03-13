import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.findFirst({ where: { name: 'Riverside Gardens' } });
  if (!site) { console.log('Site not found'); return; }

  const plots = await prisma.plot.findMany({
    where: { siteId: site.id },
    include: { jobs: { orderBy: { sortOrder: 'asc' } } },
  });

  const admin = await prisma.user.findFirst({ where: { email: 'ross@sightmanager.com' } });
  if (!admin) return;

  console.log(`\n=== SIMULATING BUILD: ${site.name} ===\n`);

  // --- WEEK 1 (Jan 5-9): Site Clearance on Plots 1-2 ---
  console.log('📅 WEEK 1: Site clearance begins on Plots 1 & 2');
  for (const plot of plots.slice(0, 2)) {
    const job = plot.jobs[0]; // Site Clearance & Setup
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-05') },
    });
    // Log event
    await prisma.eventLog.create({
      data: { siteId: site.id, plotId: plot.id, jobId: job.id, userId: admin.id,
              type: 'JOB_STARTED', description: `Started: ${job.name}` },
    });
  }

  // --- WEEK 1 END: Complete site clearance Plots 1-2, start Plots 3-4 ---
  console.log('  ✅ Plots 1-2 Site Clearance completed');
  for (const plot of plots.slice(0, 2)) {
    const job = plot.jobs[0];
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-07') },
    });
    // Start Foundations
    const nextJob = plot.jobs[1];
    await prisma.job.update({
      where: { id: nextJob.id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-07') },
    });
    await prisma.eventLog.create({
      data: { siteId: site.id, plotId: plot.id, jobId: nextJob.id, userId: admin.id,
              type: 'JOB_STARTED', description: `Started: ${nextJob.name}` },
    });
  }

  // Start clearance on Plots 3-4
  for (const plot of plots.slice(2, 4)) {
    const job = plot.jobs[0];
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-08') },
    });
  }

  // --- WEEK 2 (Jan 12-16): Foundations on 1-2, Clearance completing on 3-4 ---
  console.log('\n📅 WEEK 2: Foundations on Plots 1-2, clearance finishing 3-4');

  // Complete clearance 3-4
  for (const plot of plots.slice(2, 4)) {
    await prisma.job.update({
      where: { id: plot.jobs[0].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-10') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-12') },
    });
  }

  // Start clearance on Plots 5-6
  for (const plot of plots.slice(4, 6)) {
    await prisma.job.update({
      where: { id: plot.jobs[0].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-12') },
    });
  }

  // Complete Foundations on Plots 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-14') },
    });
    // Start Drainage
    await prisma.job.update({
      where: { id: plot.jobs[2].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-14') },
    });
  }

  // --- WEEK 3 (Jan 19-23): WEATHER DELAY! Rain stops foundations on 3-4 ---
  console.log('\n📅 WEEK 3: ⛈️ HEAVY RAIN - Foundations delayed on Plots 3-4');

  // Complete clearance 5-6
  for (const plot of plots.slice(4, 6)) {
    await prisma.job.update({
      where: { id: plot.jobs[0].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-14') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-15') },
    });
  }

  // Mark weather affected on Plots 3-4 foundations
  for (const plot of plots.slice(2, 4)) {
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { weatherAffected: true },
    });
    await prisma.eventLog.create({
      data: { siteId: site.id, plotId: plot.id, jobId: plot.jobs[1].id, userId: admin.id,
              type: 'JOB_EDITED', description: 'Foundations delayed 3 days due to heavy rain - ground waterlogged' },
    });
  }

  // Complete Drainage on Plots 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[2].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-17') },
    });
    // Start Brickwork to DPC
    await prisma.job.update({
      where: { id: plot.jobs[3].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-19') },
    });
  }

  // --- WEEK 4 (Jan 26-30): Brickwork DPC on 1-2, Foundations completing on 3-6 ---
  console.log('\n📅 WEEK 4: Brickwork to DPC on 1-2, foundations catching up 3-6');

  // Complete foundations 3-4 (delayed by 3 days)
  for (const plot of plots.slice(2, 4)) {
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-22') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[2].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-22') },
    });
  }

  // Complete Brickwork DPC on 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[3].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-22') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[4].id }, // Oversite
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-22') },
    });
  }

  // Complete foundations 5-6
  for (const plot of plots.slice(4, 6)) {
    await prisma.job.update({
      where: { id: plot.jobs[1].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-21') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[2].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-21') },
    });
  }

  // --- WEEKS 5-6 (Feb 2-13): Superstructure phase ---
  console.log('\n📅 WEEKS 5-6: Brickwork superstructure begins on Plots 1-2');

  // Complete oversite 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[4].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-24') },
    });
    // Start Brickwork Superstructure
    await prisma.job.update({
      where: { id: plot.jobs[5].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-01-26') },
    });
  }

  // Progress 3-6 through drainage, DPC, oversite
  for (const plot of plots.slice(2, 6)) {
    // Complete drainage
    await prisma.job.update({
      where: { id: plot.jobs[2].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-01-27') },
    });
    // Complete DPC
    await prisma.job.update({
      where: { id: plot.jobs[3].id },
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-01-27'), actualEndDate: new Date('2026-01-30') },
    });
    // Complete Oversite
    await prisma.job.update({
      where: { id: plot.jobs[4].id },
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-01-30'), actualEndDate: new Date('2026-02-02') },
    });
    // Start Brickwork Superstructure
    await prisma.job.update({
      where: { id: plot.jobs[5].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-02') },
    });
  }

  // Complete Brickwork Superstructure on 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[5].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-06') },
    });
    // Start Roof Carpentry
    await prisma.job.update({
      where: { id: plot.jobs[6].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-06') },
    });
  }

  // --- WEEKS 7-8 (Feb 16-27): Roofing phase, first fix begins ---
  console.log('\n📅 WEEKS 7-8: Roofing on 1-2, superstructure completing on 3-6');

  // Complete roofing sequence on 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[6].id }, // Roof Carpentry
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-10') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[7].id }, // Roof Tiling
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-10'), actualEndDate: new Date('2026-02-13') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[8].id }, // Scaffold Strip
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-13'), actualEndDate: new Date('2026-02-14') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[9].id }, // Windows
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-14'), actualEndDate: new Date('2026-02-16') },
    });
    // Start First Fix Plumbing
    await prisma.job.update({
      where: { id: plot.jobs[10].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-16') },
    });
    // Start First Fix Electrics alongside
    await prisma.job.update({
      where: { id: plot.jobs[11].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-16') },
    });
  }

  // Complete superstructure on 3-6
  for (const plot of plots.slice(2, 6)) {
    await prisma.job.update({
      where: { id: plot.jobs[5].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-12') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[6].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-12') },
    });
  }

  // --- RAISE A SNAG on Plot 1 ---
  console.log('\n🔴 SNAG RAISED: Plot 1 - Cracked lintel above front door');
  await prisma.snag.create({
    data: {
      plotId: plots[0].id,
      description: 'Cracked concrete lintel above front door - visible crack running full width. Needs replacement before plastering.',
      location: 'Front elevation, above main entrance door',
      priority: 'HIGH',
      status: 'OPEN',
      raisedById: admin.id,
      assignedToId: admin.id,
    },
  });

  // Another snag on Plot 3
  console.log('🟡 SNAG RAISED: Plot 3 - DPC membrane torn during backfill');
  await prisma.snag.create({
    data: {
      plotId: plots[2].id,
      description: 'DPC membrane torn on south-east corner during backfill. Approx 300mm tear. Repair needed before brickwork continues.',
      location: 'South-east corner, foundation level',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      raisedById: admin.id,
      assignedToId: admin.id,
      notes: 'Membrane patch ordered from supplier. Fix scheduled for tomorrow.',
    },
  });

  // --- WEEKS 9-10 (Mar 2-13): First fix completing, second fix starting ---
  console.log('\n📅 WEEKS 9-10: First fix on 1-2, roofing on 3-6');

  // Complete first fix on 1-2
  for (const plot of plots.slice(0, 2)) {
    await prisma.job.update({
      where: { id: plot.jobs[10].id }, // First Fix Plumbing
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-19') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[11].id }, // First Fix Electrics
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-19') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[12].id }, // First Fix Carpentry
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-19'), actualEndDate: new Date('2026-02-23') },
    });
    // Start Plastering
    await prisma.job.update({
      where: { id: plot.jobs[13].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-23') },
    });
  }

  // Complete roofing on 3-6
  for (const plot of plots.slice(2, 6)) {
    await prisma.job.update({
      where: { id: plot.jobs[6].id },
      data: { status: 'COMPLETED', actualEndDate: new Date('2026-02-18') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[7].id },
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-18'), actualEndDate: new Date('2026-02-21') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[8].id },
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-21'), actualEndDate: new Date('2026-02-22') },
    });
    await prisma.job.update({
      where: { id: plot.jobs[9].id },
      data: { status: 'COMPLETED', actualStartDate: new Date('2026-02-22'), actualEndDate: new Date('2026-02-24') },
    });
    // Start first fix
    await prisma.job.update({
      where: { id: plot.jobs[10].id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date('2026-02-24') },
    });
  }

  // Resolve the Plot 3 snag
  console.log('  ✅ Plot 3 DPC snag resolved');
  const snag3 = await prisma.snag.findFirst({ where: { plotId: plots[2].id } });
  if (snag3) {
    await prisma.snag.update({
      where: { id: snag3.id },
      data: { status: 'RESOLVED', resolvedAt: new Date('2026-02-15'), resolvedById: admin.id },
    });
  }

  // --- Create some material orders ---
  console.log('\n📦 Creating material orders...');

  // Get a supplier
  const supplier = await prisma.supplier.findFirst();
  if (supplier) {
    // Order for Plot 1 - Kitchen units
    const kitchenOrder = await prisma.materialOrder.create({
      data: {
        jobId: plots[0].jobs[17].id, // Kitchen Fit
        supplierId: supplier.id,
        status: 'PENDING',
        dateOfOrder: new Date('2026-02-20'),
        expectedDeliveryDate: new Date('2026-03-10'),
        orderDetails: 'Kitchen units for Plot 1 - white gloss handleless range',
        createdById: admin.id,
      },
    });
    console.log('  📦 Kitchen order created for Plot 1');

    // Order for Plots 1-2 - Plasterboard
    const plasterOrder = await prisma.materialOrder.create({
      data: {
        jobId: plots[0].jobs[13].id, // Plastering
        supplierId: supplier.id,
        status: 'DELIVERED',
        dateOfOrder: new Date('2026-02-15'),
        expectedDeliveryDate: new Date('2026-02-22'),
        deliveredDate: new Date('2026-02-21'),
        orderDetails: 'Plasterboard and skim for Plots 1-2',
        createdById: admin.id,
      },
    });
    console.log('  📦 Plasterboard order delivered for Plots 1-2');

    // Add items to the plaster order
    await prisma.materialOrderItem.create({
      data: {
        orderId: plasterOrder.id,
        description: 'Plasterboard 2400x1200x12.5mm',
        quantity: 120,
        unit: 'sheets',
        unitPrice: 8.50,
      },
    });
    await prisma.materialOrderItem.create({
      data: {
        orderId: plasterOrder.id,
        description: 'Multi-finish plaster 25kg',
        quantity: 40,
        unit: 'bags',
        unitPrice: 12.80,
      },
    });

    // Bricks order
    const brickOrder = await prisma.materialOrder.create({
      data: {
        jobId: plots[2].jobs[5].id, // Brickwork superstructure plot 3
        supplierId: supplier.id,
        status: 'DELIVERED',
        dateOfOrder: new Date('2026-01-20'),
        expectedDeliveryDate: new Date('2026-02-01'),
        deliveredDate: new Date('2026-02-03'),
        orderDetails: 'Red multi facing bricks for Plots 3-6',
        createdById: admin.id,
      },
    });
    await prisma.materialOrderItem.create({
      data: {
        orderId: brickOrder.id,
        description: 'Red Multi Facing Brick',
        quantity: 15000,
        unit: 'bricks',
        unitPrice: 0.45,
      },
    });
    console.log('  📦 Brick order delivered for Plots 3-6');
  }

  // --- Add more snags ---
  console.log('\n🔴 More snags raised...');
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

  // --- Summary ---
  const totalJobs = await prisma.job.count({ where: { plot: { siteId: site.id } } });
  const completedJobs = await prisma.job.count({ where: { plot: { siteId: site.id }, status: 'COMPLETED' } });
  const inProgressJobs = await prisma.job.count({ where: { plot: { siteId: site.id }, status: 'IN_PROGRESS' } });
  const snagCount = await prisma.snag.count({ where: { plot: { siteId: site.id } } });
  const orderCount = await prisma.materialOrder.count({ where: { job: { plot: { siteId: site.id } } } });

  console.log(`\n=== BUILD SIMULATION COMPLETE ===`);
  console.log(`Total Jobs: ${totalJobs}`);
  console.log(`Completed: ${completedJobs}`);
  console.log(`In Progress: ${inProgressJobs}`);
  console.log(`Not Started: ${totalJobs - completedJobs - inProgressJobs}`);
  console.log(`Snags: ${snagCount}`);
  console.log(`Material Orders: ${orderCount}`);
  console.log(`\nSet Dev Mode to various dates to explore:`);
  console.log(`  Jan 5, 2026  - Day 1: Site clearance begins`);
  console.log(`  Jan 19, 2026 - Week 3: Weather delay hits`);
  console.log(`  Feb 6, 2026  - Week 5: Superstructure phase`);
  console.log(`  Feb 23, 2026 - Week 8: First fix / plastering`);
  console.log(`  Mar 12, 2026 - Week 10: Current progress`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
