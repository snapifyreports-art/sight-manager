import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get the Riverside Gardens site
  const site = await prisma.site.findFirst({ where: { name: 'Riverside Gardens' } });
  if (!site) { console.log('Site not found'); return; }
  console.log('Site:', site.id);

  // Get plots
  const plots = await prisma.plot.findMany({ 
    where: { siteId: site.id }, 
    orderBy: { plotNumber: 'asc' } 
  });
  console.log('Plots:', plots.length);

  // Get the admin user (Ross Mitchell)
  const admin = await prisma.user.findFirst({ where: { email: 'ross@sightmanager.com' } });
  if (!admin) { console.log('Admin not found'); return; }

  // Set house types on plots
  for (const plot of plots) {
    const num = parseInt(plot.plotNumber || '0');
    const houseType = num <= 4 ? 'Semi-Detached 3-Bed' : 'Detached 4-Bed';
    await prisma.plot.update({ where: { id: plot.id }, data: { houseType } });
  }
  console.log('House types set');

  // Define realistic construction jobs with durations in days
  const jobDefs = [
    { name: 'Site Clearance & Setup', duration: 2, order: 1 },
    { name: 'Foundations & Groundworks', duration: 5, order: 2 },
    { name: 'Drainage & Services', duration: 3, order: 3 },
    { name: 'Brickwork to DPC', duration: 3, order: 4 },
    { name: 'Oversite & Ground Floor Slab', duration: 2, order: 5 },
    { name: 'Brickwork Superstructure', duration: 8, order: 6 },
    { name: 'Roof Carpentry', duration: 4, order: 7 },
    { name: 'Roof Tiling', duration: 3, order: 8 },
    { name: 'Scaffold Strip', duration: 1, order: 9 },
    { name: 'Windows & External Doors', duration: 2, order: 10 },
    { name: 'First Fix Plumbing', duration: 3, order: 11 },
    { name: 'First Fix Electrics', duration: 3, order: 12 },
    { name: 'First Fix Carpentry', duration: 4, order: 13 },
    { name: 'Plastering', duration: 5, order: 14 },
    { name: 'Second Fix Plumbing', duration: 3, order: 15 },
    { name: 'Second Fix Electrics', duration: 2, order: 16 },
    { name: 'Second Fix Carpentry', duration: 3, order: 17 },
    { name: 'Kitchen Fit', duration: 3, order: 18 },
    { name: 'Bathroom Tiling', duration: 2, order: 19 },
    { name: 'Decoration', duration: 4, order: 20 },
    { name: 'Final Fix & Snagging', duration: 2, order: 21 },
    { name: 'External Works & Landscaping', duration: 3, order: 22 },
    { name: 'Clean & Handover', duration: 1, order: 23 },
  ];

  // Base start date: 1 Jan 2026 (so we can simulate from there)
  const baseStart = new Date('2026-01-05');

  for (const plot of plots) {
    const plotNum = parseInt(plot.plotNumber || '0');
    // Stagger start: plots 1-2 start Day 0, plots 3-4 start Day 5, plots 5-6 start Day 10
    const staggerDays = plotNum <= 2 ? 0 : plotNum <= 4 ? 5 : 10;
    
    let currentDay = staggerDays;
    
    for (const jd of jobDefs) {
      const startDate = new Date(baseStart);
      startDate.setDate(startDate.getDate() + currentDay);
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + jd.duration);
      
      // Budget: realistic costs
      const budgets: Record<string, number> = {
        'Site Clearance & Setup': 2500,
        'Foundations & Groundworks': 12000,
        'Drainage & Services': 4500,
        'Brickwork to DPC': 3800,
        'Oversite & Ground Floor Slab': 5200,
        'Brickwork Superstructure': 18000,
        'Roof Carpentry': 7500,
        'Roof Tiling': 4200,
        'Scaffold Strip': 1800,
        'Windows & External Doors': 6500,
        'First Fix Plumbing': 3200,
        'First Fix Electrics': 2800,
        'First Fix Carpentry': 4000,
        'Plastering': 5500,
        'Second Fix Plumbing': 2500,
        'Second Fix Electrics': 1800,
        'Second Fix Carpentry': 3200,
        'Kitchen Fit': 4500,
        'Bathroom Tiling': 2200,
        'Decoration': 3800,
        'Final Fix & Snagging': 1500,
        'External Works & Landscaping': 6000,
        'Clean & Handover': 800,
      };

      await prisma.job.create({
        data: {
          name: jd.name,
          plotId: plot.id,
          status: 'NOT_STARTED',
          startDate,
          endDate,
          sortOrder: jd.order,
          assignedToId: admin.id,
        },
      });

      currentDay += jd.duration;
    }
    console.log(`Plot ${plot.plotNumber}: ${jobDefs.length} jobs created (stagger: +${staggerDays}d)`);
  }

  console.log('Done! Total jobs:', plots.length * jobDefs.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
