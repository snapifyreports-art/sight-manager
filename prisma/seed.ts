import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { DEFAULT_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const adminPassword = await hash("Admin1234!", 12);
  const userPassword = await hash("User1234!", 12);

  // --- Users ---
  const ceo = await prisma.user.upsert({
    where: { email: "ross@sightmanager.com" },
    update: {},
    create: { name: "Ross Mitchell", email: "ross@sightmanager.com", password: adminPassword, role: "CEO", jobTitle: "CEO", company: "Sight Manager Ltd", phone: "07700 900001" },
  });
  const siteManager = await prisma.user.upsert({
    where: { email: "john@sightmanager.com" },
    update: {},
    create: { name: "John Hudson", email: "john@sightmanager.com", password: adminPassword, role: "SITE_MANAGER", jobTitle: "Site Manager", company: "Sight Manager Ltd", phone: "07700 900002" },
  });
  const contractManager = await prisma.user.upsert({
    where: { email: "ryan@sightmanager.com" },
    update: {},
    create: { name: "Ryan Davies", email: "ryan@sightmanager.com", password: adminPassword, role: "CONTRACT_MANAGER", jobTitle: "Contract Manager", company: "Sight Manager Ltd", phone: "07700 900003" },
  });
  const director = await prisma.user.upsert({
    where: { email: "andy@sightmanager.com" },
    update: {},
    create: { name: "Andy Roberts", email: "andy@sightmanager.com", password: adminPassword, role: "DIRECTOR", jobTitle: "Director", company: "Sight Manager Ltd", phone: "07700 900004" },
  });
  const contractor1 = await prisma.user.upsert({
    where: { email: "mike@buildright.com" },
    update: {},
    create: { name: "Mike Thompson", email: "mike@buildright.com", password: userPassword, role: "CONTRACTOR", jobTitle: "Roofing Contractor", company: "BuildRight Roofing", phone: "07700 900005" },
  });
  const contractor2 = await prisma.user.upsert({
    where: { email: "dave@sparkelectrical.com" },
    update: {},
    create: { name: "Dave Wilson", email: "dave@sparkelectrical.com", password: userPassword, role: "CONTRACTOR", jobTitle: "Electrical Contractor", company: "Spark Electrical", phone: "07700 900006" },
  });
  console.log("Users created");

  // --- User Permissions ---
  const allUsers = [ceo, siteManager, contractManager, director, contractor1, contractor2];
  for (const u of allUsers) {
    const defaults = DEFAULT_PERMISSIONS[u.role as UserRole] || [];
    await prisma.userPermission.createMany({
      data: defaults.map((p) => ({ userId: u.id, permission: p })),
      skipDuplicates: true,
    });
  }
  console.log("User permissions created");

  // --- Suppliers ---
  const supplier1 = await prisma.supplier.create({ data: { name: "Travis Perkins", contactName: "Sarah Collins", contactEmail: "orders@travisperkins.com", contactNumber: "0345 600 6688", type: "General", accountNumber: "TP-98234" } });
  const supplier2 = await prisma.supplier.create({ data: { name: "Jewson", contactName: "Mark Turner", contactEmail: "trade@jewson.com", contactNumber: "0800 539 766", type: "Timber", accountNumber: "JW-44521" } });
  const supplier3 = await prisma.supplier.create({ data: { name: "Marley Roof Tiles", contactName: "James Pearson", contactEmail: "orders@marley.co.uk", contactNumber: "01onal 283947", type: "Roof", accountNumber: "MR-77123" } });
  const supplier4 = await prisma.supplier.create({ data: { name: "Edmundson Electrical", contactName: "Laura Adams", contactEmail: "orders@edmundson.co.uk", contactNumber: "0121 456 7890", type: "Electrical", accountNumber: "EE-33098" } });
  const supplier5 = await prisma.supplier.create({ data: { name: "Taylor Wimpey Supplies", contactName: "Chris Norton", contactEmail: "supplies@tw.com", contactNumber: "0207 845 1234", type: "General", accountNumber: "TW-55672" } });
  console.log("Suppliers created");

  // --- Contacts ---
  const contacts = await Promise.all([
    prisma.contact.create({ data: { name: "Sarah Collins", email: "orders@travisperkins.com", phone: "0345 600 6688", type: "SUPPLIER", company: "Travis Perkins" } }),
    prisma.contact.create({ data: { name: "Mark Turner", email: "trade@jewson.com", phone: "0800 539 766", type: "SUPPLIER", company: "Jewson" } }),
    prisma.contact.create({ data: { name: "James Pearson", email: "orders@marley.co.uk", phone: "01onal 283947", type: "SUPPLIER", company: "Marley Roof Tiles" } }),
    prisma.contact.create({ data: { name: "Laura Adams", email: "orders@edmundson.co.uk", phone: "0121 456 7890", type: "SUPPLIER", company: "Edmundson Electrical" } }),
    prisma.contact.create({ data: { name: "Mike Thompson", email: "mike@buildright.com", phone: "07700 900005", type: "CONTRACTOR", company: "BuildRight Roofing" } }),
    prisma.contact.create({ data: { name: "Dave Wilson", email: "dave@sparkelectrical.com", phone: "07700 900006", type: "CONTRACTOR", company: "Spark Electrical" } }),
    prisma.contact.create({ data: { name: "Paul Jenkins", email: "paul@jenkinsplumbing.com", phone: "07700 900007", type: "CONTRACTOR", company: "Jenkins Plumbing", notes: "Reliable, always on time" } }),
    prisma.contact.create({ data: { name: "Steve Baker", email: "steve@bakergrounds.com", phone: "07700 900008", type: "CONTRACTOR", company: "Baker Groundworks", notes: "Preferred groundworks contractor" } }),
  ]);
  console.log("Contacts created");

  // --- Sites ---
  const site1 = await prisma.site.create({
    data: { name: "Meadow View Estate - Phase 1", description: "New build housing development - 24 units. Phase 1 covers plots 1-12.", location: "Birmingham", address: "Meadow Lane, Solihull, B91 3QR", status: "ACTIVE", createdById: siteManager.id },
  });
  const site2 = await prisma.site.create({
    data: { name: "Oakwood Park - Block A", description: "Apartment block conversion. 8 apartments across 3 floors.", location: "Manchester", address: "Oakwood Road, Didsbury, M20 6RT", status: "ACTIVE", createdById: siteManager.id },
  });
  const site3 = await prisma.site.create({
    data: { name: "River Court Refurbishment", description: "Commercial office refurbishment. Strip out and refit.", location: "Leeds", address: "River Court, Wellington St, Leeds, LS1 4AP", status: "ACTIVE", createdById: contractManager.id },
  });
  console.log("Sites created");

  // --- Plots ---
  const plot1a = await prisma.plot.create({ data: { name: "Plots 1-4", description: "Detached 4-bed houses", siteId: site1.id } });
  const plot1b = await prisma.plot.create({ data: { name: "Plots 5-8", description: "Semi-detached 3-bed houses", siteId: site1.id } });
  const plot1c = await prisma.plot.create({ data: { name: "Plots 9-12", description: "Detached 3-bed houses", siteId: site1.id } });

  const plot2a = await prisma.plot.create({ data: { name: "Ground Floor", description: "Apartments 1-3", siteId: site2.id } });
  const plot2b = await prisma.plot.create({ data: { name: "First Floor", description: "Apartments 4-5", siteId: site2.id } });
  const plot2c = await prisma.plot.create({ data: { name: "Second Floor", description: "Apartments 6-8", siteId: site2.id } });

  const plot3a = await prisma.plot.create({ data: { name: "Main Office Area", description: "Open plan office and meeting rooms", siteId: site3.id } });
  console.log("Plots created");

  // --- Jobs ---
  // Meadow View - Plots 1-4
  const j1 = await prisma.job.create({ data: { name: "Groundworks", description: "Foundation excavation and concrete pour", plotId: plot1a.id, startDate: new Date("2026-02-15"), endDate: new Date("2026-03-15"), status: "COMPLETED", assignedToId: contractor1.id } });
  const j2 = await prisma.job.create({ data: { name: "Brickwork", description: "Superstructure brickwork", plotId: plot1a.id, startDate: new Date("2026-03-10"), endDate: new Date("2026-04-20"), status: "IN_PROGRESS", assignedToId: contractor1.id } });
  const j3 = await prisma.job.create({ data: { name: "Roofing", description: "Roof trusses and tiling", plotId: plot1a.id, startDate: new Date("2026-04-15"), endDate: new Date("2026-05-10"), status: "NOT_STARTED", assignedToId: contractor1.id } });
  const j4 = await prisma.job.create({ data: { name: "First Fix Electrical", description: "First fix wiring and back boxes", plotId: plot1a.id, startDate: new Date("2026-05-05"), endDate: new Date("2026-05-25"), status: "NOT_STARTED", assignedToId: contractor2.id } });
  const j5 = await prisma.job.create({ data: { name: "First Fix Plumbing", description: "First fix pipework and drainage", plotId: plot1a.id, startDate: new Date("2026-05-05"), endDate: new Date("2026-05-30"), status: "NOT_STARTED", assignedToId: contractor1.id } });
  const j6 = await prisma.job.create({ data: { name: "Plastering", description: "Internal walls and ceilings", plotId: plot1a.id, startDate: new Date("2026-06-01"), endDate: new Date("2026-06-20"), status: "NOT_STARTED", assignedToId: contractor1.id } });

  // Meadow View - Plots 5-8
  const j7 = await prisma.job.create({ data: { name: "Groundworks", description: "Foundation excavation and concrete pour", plotId: plot1b.id, startDate: new Date("2026-03-20"), endDate: new Date("2026-04-20"), status: "IN_PROGRESS", assignedToId: contractor1.id } });
  const j8 = await prisma.job.create({ data: { name: "Brickwork", description: "Superstructure brickwork", plotId: plot1b.id, startDate: new Date("2026-04-15"), endDate: new Date("2026-05-25"), status: "NOT_STARTED", assignedToId: contractor1.id } });
  const j9 = await prisma.job.create({ data: { name: "Roofing", description: "Roof trusses and tiling", plotId: plot1b.id, startDate: new Date("2026-05-20"), endDate: new Date("2026-06-15"), status: "NOT_STARTED", assignedToId: contractor1.id } });

  // Oakwood Park - Ground Floor
  const j10 = await prisma.job.create({ data: { name: "Strip Out", description: "Complete strip out of existing ground floor layout", plotId: plot2a.id, startDate: new Date("2026-02-01"), endDate: new Date("2026-02-28"), status: "COMPLETED", assignedToId: contractor1.id } });
  const j11 = await prisma.job.create({ data: { name: "Structural Works", description: "Steel frame installation and structural modifications", plotId: plot2a.id, startDate: new Date("2026-03-01"), endDate: new Date("2026-04-15"), status: "ON_HOLD", assignedToId: contractor1.id } });
  const j12 = await prisma.job.create({ data: { name: "M&E First Fix", description: "Mechanical and electrical first fix", plotId: plot2a.id, startDate: new Date("2026-04-15"), endDate: new Date("2026-05-30"), status: "NOT_STARTED", assignedToId: contractor2.id } });

  // River Court - Main Office
  const j13 = await prisma.job.create({ data: { name: "Demolition & Strip Out", description: "Remove existing partitions, ceilings, and floor finishes", plotId: plot3a.id, startDate: new Date("2026-01-15"), endDate: new Date("2026-02-15"), status: "COMPLETED", assignedToId: contractor1.id } });
  const j14 = await prisma.job.create({ data: { name: "New Partitions & Ceilings", description: "Install new stud partitions and suspended ceilings", plotId: plot3a.id, startDate: new Date("2026-02-20"), endDate: new Date("2026-03-25"), status: "IN_PROGRESS", assignedToId: contractor1.id } });
  const j15 = await prisma.job.create({ data: { name: "Second Fix & Finishes", description: "Decorating, flooring, and final fit-out", plotId: plot3a.id, startDate: new Date("2026-03-25"), endDate: new Date("2026-04-30"), status: "NOT_STARTED", assignedToId: contractor1.id } });
  console.log("Jobs created");

  // --- Material Orders with OrderItems ---
  const order1 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier1.id, jobId: j2.id, contactId: contacts[0].id,
      orderDetails: "Bricks for plots 1-4 brickwork", orderType: "Materials", status: "CONFIRMED",
      dateOfOrder: new Date("2026-03-01"), expectedDeliveryDate: new Date("2026-03-18"), leadTimeDays: 14,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order1.id, name: "Ibstock Leicester Red Multi", quantity: 10000, unit: "units", unitCost: 0.45, totalCost: 4500 },
    { orderId: order1.id, name: "Mortar Mix (25kg bags)", quantity: 50, unit: "bags", unitCost: 6.50, totalCost: 325 },
  ]});

  const order2 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier3.id, jobId: j3.id, contactId: contacts[2].id,
      orderDetails: "Roof trusses and tiles for plots 1-2", orderType: "Materials", status: "PENDING",
      dateOfOrder: new Date("2026-03-07"), expectedDeliveryDate: new Date("2026-04-10"), leadTimeDays: 21,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order2.id, name: "Fink Roof Trusses", quantity: 12, unit: "sets", unitCost: 285, totalCost: 3420 },
    { orderId: order2.id, name: "Ridge Board 150x38mm", quantity: 6, unit: "lengths", unitCost: 18.50, totalCost: 111 },
    { orderId: order2.id, name: "Roofing Felt (15m rolls)", quantity: 8, unit: "rolls", unitCost: 32, totalCost: 256 },
    { orderId: order2.id, name: "Marley Modern Roof Tiles", quantity: 2400, unit: "tiles", unitCost: 0.95, totalCost: 2280 },
  ]});

  const order3 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier4.id, jobId: j4.id, contactId: contacts[3].id,
      orderDetails: "Electrical first fix materials", orderType: "Materials", status: "ORDERED",
      dateOfOrder: new Date("2026-04-01"), expectedDeliveryDate: new Date("2026-05-01"), leadTimeDays: 7,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order3.id, name: "Twin & Earth 2.5mm Cable", quantity: 20, unit: "rolls", unitCost: 42, totalCost: 840 },
    { orderId: order3.id, name: "Metal Back Boxes (35mm)", quantity: 200, unit: "units", unitCost: 0.85, totalCost: 170 },
    { orderId: order3.id, name: "Consumer Unit 18-way", quantity: 4, unit: "units", unitCost: 165, totalCost: 660 },
  ]});

  const order4 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier2.id, jobId: j1.id,
      orderDetails: "Concrete for foundations", orderType: "Materials", status: "DELIVERED",
      dateOfOrder: new Date("2026-02-10"), expectedDeliveryDate: new Date("2026-02-20"), deliveredDate: new Date("2026-02-20"), leadTimeDays: 3,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order4.id, name: "Ready-mix Concrete C30", quantity: 48, unit: "m³", unitCost: 95, totalCost: 4560 },
  ]});

  const order5 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier1.id, jobId: j11.id,
      orderDetails: "Structural steel beams", orderType: "Materials", status: "PENDING",
      dateOfOrder: new Date("2026-02-25"), expectedDeliveryDate: new Date("2026-03-25"), leadTimeDays: 28,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order5.id, name: "RSJ 203x133mm Steel Beam", quantity: 6, unit: "lengths", unitCost: 320, totalCost: 1920 },
    { orderId: order5.id, name: "RSJ 254x146mm Steel Beam", quantity: 4, unit: "lengths", unitCost: 445, totalCost: 1780 },
    { orderId: order5.id, name: "Base Plates 200x200mm", quantity: 10, unit: "units", unitCost: 28, totalCost: 280 },
  ]});

  const order6 = await prisma.materialOrder.create({
    data: {
      supplierId: supplier2.id, jobId: j14.id,
      orderDetails: "Partitioning materials", orderType: "Materials", status: "DELIVERED",
      dateOfOrder: new Date("2026-02-15"), expectedDeliveryDate: new Date("2026-02-25"), deliveredDate: new Date("2026-02-24"), leadTimeDays: 5,
    },
  });
  await prisma.orderItem.createMany({ data: [
    { orderId: order6.id, name: "Metal Stud 70mm C-Section", quantity: 100, unit: "lengths", unitCost: 4.20, totalCost: 420 },
    { orderId: order6.id, name: "Plasterboard 12.5mm", quantity: 80, unit: "sheets", unitCost: 8.50, totalCost: 680 },
    { orderId: order6.id, name: "Drywall Screws (box 1000)", quantity: 10, unit: "boxes", unitCost: 12, totalCost: 120 },
  ]});
  console.log("Orders and items created");

  // --- Event Log ---
  await prisma.eventLog.createMany({ data: [
    { type: "SITE_CREATED", description: "Site 'Meadow View Estate - Phase 1' created", siteId: site1.id, userId: siteManager.id, createdAt: new Date("2026-02-01") },
    { type: "SITE_CREATED", description: "Site 'Oakwood Park - Block A' created", siteId: site2.id, userId: siteManager.id, createdAt: new Date("2026-01-20") },
    { type: "SITE_CREATED", description: "Site 'River Court Refurbishment' created", siteId: site3.id, userId: contractManager.id, createdAt: new Date("2026-01-10") },
    { type: "PLOT_CREATED", description: "Plots 1-4 added to Meadow View Estate", siteId: site1.id, plotId: plot1a.id, userId: siteManager.id, createdAt: new Date("2026-02-02") },
    { type: "PLOT_CREATED", description: "Plots 5-8 added to Meadow View Estate", siteId: site1.id, plotId: plot1b.id, userId: siteManager.id, createdAt: new Date("2026-02-02") },
    { type: "JOB_STARTED", description: "Groundworks started on Plots 1-4", siteId: site1.id, plotId: plot1a.id, jobId: j1.id, userId: contractor1.id, createdAt: new Date("2026-02-15") },
    { type: "JOB_COMPLETED", description: "Groundworks completed for Plots 1-4", siteId: site1.id, plotId: plot1a.id, jobId: j1.id, userId: contractor1.id, createdAt: new Date("2026-03-12") },
    { type: "JOB_STARTED", description: "Brickwork started on Plots 1-4", siteId: site1.id, plotId: plot1a.id, jobId: j2.id, userId: contractor1.id, createdAt: new Date("2026-03-10") },
    { type: "ORDER_PLACED", description: "Brick order placed with Travis Perkins - 10,000 units", siteId: site1.id, jobId: j2.id, userId: siteManager.id, createdAt: new Date("2026-03-05") },
    { type: "ORDER_DELIVERED", description: "Concrete delivery received - 48m³ C30", siteId: site1.id, jobId: j1.id, userId: siteManager.id, createdAt: new Date("2026-02-20") },
    { type: "JOB_STARTED", description: "Strip out started at Oakwood Park ground floor", siteId: site2.id, plotId: plot2a.id, jobId: j10.id, userId: contractor1.id, createdAt: new Date("2026-02-01") },
    { type: "JOB_COMPLETED", description: "Strip out completed at Oakwood Park ground floor", siteId: site2.id, plotId: plot2a.id, jobId: j10.id, userId: contractor1.id, createdAt: new Date("2026-02-26") },
    { type: "JOB_STOPPED", description: "Structural works paused - awaiting engineer sign-off", siteId: site2.id, plotId: plot2a.id, jobId: j11.id, userId: siteManager.id, createdAt: new Date("2026-03-08") },
    { type: "JOB_STARTED", description: "Demolition started at River Court", siteId: site3.id, plotId: plot3a.id, jobId: j13.id, userId: contractor1.id, createdAt: new Date("2026-01-15") },
    { type: "JOB_COMPLETED", description: "Demolition completed at River Court", siteId: site3.id, plotId: plot3a.id, jobId: j13.id, userId: contractor1.id, createdAt: new Date("2026-02-14") },
    { type: "JOB_STARTED", description: "New partitions installation started at River Court", siteId: site3.id, plotId: plot3a.id, jobId: j14.id, userId: contractor1.id, createdAt: new Date("2026-02-20") },
    { type: "JOB_STARTED", description: "Groundworks started on Plots 5-8", siteId: site1.id, plotId: plot1b.id, jobId: j7.id, userId: contractor1.id, createdAt: new Date("2026-03-20") },
    { type: "NOTIFICATION", description: "Structural steel delivery overdue for Oakwood Park", siteId: site2.id, jobId: j11.id, createdAt: new Date("2026-03-09") },
  ]});
  console.log("Events created");

  // --- Job Actions ---
  await prisma.jobAction.createMany({ data: [
    { jobId: j1.id, userId: contractor1.id, action: "start", notes: "Starting groundworks on plots 1-4", createdAt: new Date("2026-02-15") },
    { jobId: j1.id, userId: contractor1.id, action: "complete", notes: "All foundations poured and cured", createdAt: new Date("2026-03-12") },
    { jobId: j2.id, userId: contractor1.id, action: "start", notes: "Commencing brickwork", createdAt: new Date("2026-03-10") },
    { jobId: j10.id, userId: contractor1.id, action: "start", notes: "Strip out beginning", createdAt: new Date("2026-02-01") },
    { jobId: j10.id, userId: contractor1.id, action: "complete", notes: "Strip out finished ahead of schedule", createdAt: new Date("2026-02-26") },
    { jobId: j11.id, userId: siteManager.id, action: "stop", notes: "Paused pending structural engineer approval", createdAt: new Date("2026-03-08") },
    { jobId: j13.id, userId: contractor1.id, action: "start", notes: "Demolition started", createdAt: new Date("2026-01-15") },
    { jobId: j13.id, userId: contractor1.id, action: "complete", notes: "All demolition complete, site cleared", createdAt: new Date("2026-02-14") },
    { jobId: j14.id, userId: contractor1.id, action: "start", notes: "Starting partition walls", createdAt: new Date("2026-02-20") },
  ]});
  console.log("Job actions created");

  // --- Plot Templates ---
  // Template 1: Appletree — NEW hierarchical sub-jobs
  const tpl1 = await prisma.plotTemplate.create({
    data: {
      name: "House - Appletree",
      description: "Standard detached 4-bed house build with full programme",
      typeLabel: "Detached 4-Bed",
    },
  });

  // Groundworks stage (Wk 1-5) with sub-jobs
  const gw = await prisma.templateJob.create({ data: { templateId: tpl1.id, name: "Groundworks", stageCode: "GW", sortOrder: 0, startWeek: 1, endWeek: 5 } });
  const gwFnd = await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: gw.id, name: "Foundations", stageCode: "FND", sortOrder: 0, startWeek: 1, endWeek: 2, durationWeeks: 2 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: gw.id, name: "Damp Proof Course", stageCode: "DPC", sortOrder: 1, startWeek: 3, endWeek: 3, durationWeeks: 1 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: gw.id, name: "Oversite", stageCode: "OG", sortOrder: 2, startWeek: 4, endWeek: 4, durationWeeks: 1 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: gw.id, name: "Drainage", stageCode: "DRN", sortOrder: 3, startWeek: 5, endWeek: 5, durationWeeks: 1 } });

  // Brickwork stage (Wk 6-9) with sub-jobs
  const bw = await prisma.templateJob.create({ data: { templateId: tpl1.id, name: "Brickwork", stageCode: "BW", sortOrder: 1, startWeek: 6, endWeek: 9 } });
  const bwB1 = await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: bw.id, name: "Brickwork 1st Lift", stageCode: "B1", sortOrder: 0, startWeek: 6, endWeek: 7, durationWeeks: 2 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: bw.id, name: "Brickwork 2nd Lift", stageCode: "B2", sortOrder: 1, startWeek: 8, endWeek: 9, durationWeeks: 2 } });

  // Roofing stage (Wk 10-11) with sub-jobs
  const rf = await prisma.templateJob.create({ data: { templateId: tpl1.id, name: "Roofing", stageCode: "RF", sortOrder: 2, startWeek: 10, endWeek: 11 } });
  const rfRfs = await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: rf.id, name: "Roof Structure", stageCode: "RFS", sortOrder: 0, startWeek: 10, endWeek: 10, durationWeeks: 1 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: rf.id, name: "Tiling", stageCode: "TL", sortOrder: 1, startWeek: 11, endWeek: 11, durationWeeks: 1 } });

  // First Fix stage (Wk 12-17) with sub-jobs
  const ff = await prisma.templateJob.create({ data: { templateId: tpl1.id, name: "First Fix", stageCode: "1F", sortOrder: 3, startWeek: 12, endWeek: 17 } });
  const ff1fe = await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: ff.id, name: "First Fix Electrical", stageCode: "1FE", sortOrder: 0, startWeek: 12, endWeek: 13, durationWeeks: 2 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: ff.id, name: "First Fix Plumbing", stageCode: "1FP", sortOrder: 1, startWeek: 14, endWeek: 15, durationWeeks: 2 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: ff.id, name: "First Fix Joinery", stageCode: "1FJ", sortOrder: 2, startWeek: 16, endWeek: 17, durationWeeks: 2 } });

  // Plastering stage (Wk 18-19)
  const pl = await prisma.templateJob.create({ data: { templateId: tpl1.id, name: "Plastering", stageCode: "PL", sortOrder: 4, startWeek: 18, endWeek: 19 } });
  await prisma.templateJob.create({ data: { templateId: tpl1.id, parentId: pl.id, name: "Plastering", stageCode: "PL", sortOrder: 0, startWeek: 18, endWeek: 19, durationWeeks: 2 } });

  // Template orders — attached to sub-jobs
  const tplOrder1 = await prisma.templateOrder.create({
    data: { templateJobId: gwFnd.id, itemsDescription: "Concrete for foundations", orderWeekOffset: -2, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder1.id, name: "Ready-mix Concrete C30", quantity: 48, unit: "m³", unitCost: 95 },
  ]});

  const tplOrder2 = await prisma.templateOrder.create({
    data: { templateJobId: bwB1.id, itemsDescription: "Bricks and mortar", orderWeekOffset: -2, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder2.id, name: "Ibstock Leicester Red Multi", quantity: 10000, unit: "units", unitCost: 0.45 },
    { templateOrderId: tplOrder2.id, name: "Mortar Mix (25kg bags)", quantity: 50, unit: "bags", unitCost: 6.50 },
  ]});

  const tplOrder3 = await prisma.templateOrder.create({
    data: { templateJobId: rfRfs.id, itemsDescription: "Roof trusses and tiles", orderWeekOffset: -3, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder3.id, name: "Fink Roof Trusses", quantity: 12, unit: "sets", unitCost: 285 },
    { templateOrderId: tplOrder3.id, name: "Marley Modern Roof Tiles", quantity: 2400, unit: "tiles", unitCost: 0.95 },
    { templateOrderId: tplOrder3.id, name: "Roofing Felt (15m rolls)", quantity: 8, unit: "rolls", unitCost: 32 },
  ]});

  const tplOrder4 = await prisma.templateOrder.create({
    data: { templateJobId: ff1fe.id, itemsDescription: "Electrical first fix materials", orderWeekOffset: -1, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder4.id, name: "Twin & Earth 2.5mm Cable", quantity: 20, unit: "rolls", unitCost: 42 },
    { templateOrderId: tplOrder4.id, name: "Metal Back Boxes (35mm)", quantity: 200, unit: "units", unitCost: 0.85 },
    { templateOrderId: tplOrder4.id, name: "Consumer Unit 18-way", quantity: 4, unit: "units", unitCost: 165 },
  ]});

  // Template 2: Peartree
  const tpl2 = await prisma.plotTemplate.create({
    data: {
      name: "House - Peartree",
      description: "Semi-detached 3-bed house build - shorter timeline",
      typeLabel: "Semi-Detached 3-Bed",
    },
  });
  const tpl2Jobs = await Promise.all([
    prisma.templateJob.create({ data: { templateId: tpl2.id, name: "Groundworks", description: "Foundation excavation and pour", sortOrder: 0, startWeek: 1, endWeek: 2 } }),
    prisma.templateJob.create({ data: { templateId: tpl2.id, name: "Brickwork", description: "Superstructure brickwork", sortOrder: 1, startWeek: 2, endWeek: 5 } }),
    prisma.templateJob.create({ data: { templateId: tpl2.id, name: "Roofing", description: "Roof trusses and tiling", sortOrder: 2, startWeek: 5, endWeek: 7 } }),
    prisma.templateJob.create({ data: { templateId: tpl2.id, name: "First Fix", description: "Combined electrical and plumbing first fix", sortOrder: 3, startWeek: 7, endWeek: 9 } }),
    prisma.templateJob.create({ data: { templateId: tpl2.id, name: "Plastering", description: "Walls and ceilings", sortOrder: 4, startWeek: 9, endWeek: 10 } }),
  ]);

  const tplOrder5 = await prisma.templateOrder.create({
    data: { templateJobId: tpl2Jobs[0].id, itemsDescription: "Concrete for foundations", orderWeekOffset: -2, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder5.id, name: "Ready-mix Concrete C30", quantity: 30, unit: "m³", unitCost: 95 },
  ]});

  const tplOrder6 = await prisma.templateOrder.create({
    data: { templateJobId: tpl2Jobs[1].id, itemsDescription: "Bricks and mortar", orderWeekOffset: -2, deliveryWeekOffset: 0 },
  });
  await prisma.templateOrderItem.createMany({ data: [
    { templateOrderId: tplOrder6.id, name: "Ibstock Leicester Red Multi", quantity: 7000, unit: "units", unitCost: 0.45 },
    { templateOrderId: tplOrder6.id, name: "Mortar Mix (25kg bags)", quantity: 35, unit: "bags", unitCost: 6.50 },
  ]});

  console.log("Plot templates created");

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
