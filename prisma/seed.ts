import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create users
  const adminPassword = await hash("Admin1234!", 12);
  const userPassword = await hash("User1234!", 12);

  const ceo = await prisma.user.upsert({
    where: { email: "ross@sightmanager.com" },
    update: {},
    create: {
      name: "Ross Mitchell",
      email: "ross@sightmanager.com",
      password: adminPassword,
      role: "CEO",
      jobTitle: "CEO",
      company: "Sight Manager Ltd",
      phone: "07700 900001",
    },
  });

  const siteManager = await prisma.user.upsert({
    where: { email: "john@sightmanager.com" },
    update: {},
    create: {
      name: "John Hudson",
      email: "john@sightmanager.com",
      password: adminPassword,
      role: "SITE_MANAGER",
      jobTitle: "Site Manager",
      company: "Sight Manager Ltd",
      phone: "07700 900002",
    },
  });

  const contractManager = await prisma.user.upsert({
    where: { email: "ryan@sightmanager.com" },
    update: {},
    create: {
      name: "Ryan Davies",
      email: "ryan@sightmanager.com",
      password: adminPassword,
      role: "CONTRACT_MANAGER",
      jobTitle: "Contract Manager",
      company: "Sight Manager Ltd",
      phone: "07700 900003",
    },
  });

  const director = await prisma.user.upsert({
    where: { email: "andy@sightmanager.com" },
    update: {},
    create: {
      name: "Andy Roberts",
      email: "andy@sightmanager.com",
      password: adminPassword,
      role: "DIRECTOR",
      jobTitle: "Director",
      company: "Sight Manager Ltd",
      phone: "07700 900004",
    },
  });

  const contractor1 = await prisma.user.upsert({
    where: { email: "mike@buildright.com" },
    update: {},
    create: {
      name: "Mike Thompson",
      email: "mike@buildright.com",
      password: userPassword,
      role: "CONTRACTOR",
      jobTitle: "Roofing Contractor",
      company: "BuildRight Roofing",
      phone: "07700 900005",
    },
  });

  const contractor2 = await prisma.user.upsert({
    where: { email: "dave@sparkelectrical.com" },
    update: {},
    create: {
      name: "Dave Wilson",
      email: "dave@sparkelectrical.com",
      password: userPassword,
      role: "CONTRACTOR",
      jobTitle: "Electrical Contractor",
      company: "Spark Electrical",
      phone: "07700 900006",
    },
  });

  console.log("Users created");

  // Create suppliers
  const supplier1 = await prisma.supplier.create({
    data: {
      name: "Travis Perkins",
      contactName: "Sarah Collins",
      contactEmail: "orders@travisperkins.com",
      contactNumber: "0345 600 6688",
      type: "General",
      accountNumber: "TP-98234",
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      name: "Jewson",
      contactName: "Mark Turner",
      contactEmail: "trade@jewson.com",
      contactNumber: "0800 539 766",
      type: "Timber",
      accountNumber: "JW-44521",
    },
  });

  const supplier3 = await prisma.supplier.create({
    data: {
      name: "Marley Roof Tiles",
      contactName: "James Pearson",
      contactEmail: "orders@marley.co.uk",
      contactNumber: "01onal 283947",
      type: "Roof",
      accountNumber: "MR-77123",
    },
  });

  const supplier4 = await prisma.supplier.create({
    data: {
      name: "Edmundson Electrical",
      contactName: "Laura Adams",
      contactEmail: "orders@edmundson.co.uk",
      contactNumber: "0121 456 7890",
      type: "Electrical",
      accountNumber: "EE-33098",
    },
  });

  const supplier5 = await prisma.supplier.create({
    data: {
      name: "Taylor Wimpey Supplies",
      contactName: "Chris Norton",
      contactEmail: "supplies@tw.com",
      contactNumber: "0207 845 1234",
      type: "General",
      accountNumber: "TW-55672",
    },
  });

  console.log("Suppliers created");

  // Create contacts
  await prisma.contact.createMany({
    data: [
      { name: "Sarah Collins", email: "orders@travisperkins.com", phone: "0345 600 6688", type: "SUPPLIER", company: "Travis Perkins" },
      { name: "Mark Turner", email: "trade@jewson.com", phone: "0800 539 766", type: "SUPPLIER", company: "Jewson" },
      { name: "James Pearson", email: "orders@marley.co.uk", phone: "01onal 283947", type: "SUPPLIER", company: "Marley Roof Tiles" },
      { name: "Laura Adams", email: "orders@edmundson.co.uk", phone: "0121 456 7890", type: "SUPPLIER", company: "Edmundson Electrical" },
      { name: "Mike Thompson", email: "mike@buildright.com", phone: "07700 900005", type: "CONTRACTOR", company: "BuildRight Roofing" },
      { name: "Dave Wilson", email: "dave@sparkelectrical.com", phone: "07700 900006", type: "CONTRACTOR", company: "Spark Electrical" },
      { name: "Paul Jenkins", email: "paul@jenkinspluming.com", phone: "07700 900007", type: "CONTRACTOR", company: "Jenkins Plumbing", notes: "Reliable, always on time" },
      { name: "Steve Baker", email: "steve@bakergrounds.com", phone: "07700 900008", type: "CONTRACTOR", company: "Baker Groundworks", notes: "Preferred groundworks contractor" },
    ],
  });

  console.log("Contacts created");

  // Create workflows
  const workflow1 = await prisma.workflow.create({
    data: {
      name: "Meadow View Estate - Phase 1",
      description: "New build housing development - 24 units. Phase 1 covers plots 1-12.",
      status: "active",
      createdById: siteManager.id,
    },
  });

  const workflow2 = await prisma.workflow.create({
    data: {
      name: "Oakwood Park - Block A",
      description: "Apartment block conversion. 8 apartments across 3 floors.",
      status: "active",
      createdById: siteManager.id,
    },
  });

  const workflow3 = await prisma.workflow.create({
    data: {
      name: "River Court Refurbishment",
      description: "Commercial office refurbishment. Strip out and refit.",
      status: "active",
      createdById: contractManager.id,
    },
  });

  console.log("Workflows created");

  // Create jobs for Workflow 1 - Meadow View
  const jobs1 = await Promise.all([
    prisma.job.create({
      data: {
        name: "Groundworks - Plot 1-4",
        description: "Foundation excavation and concrete pour for plots 1-4",
        workflowId: workflow1.id,
        siteName: "Meadow View Estate",
        plot: "1-4",
        location: "Birmingham",
        address: "Meadow Lane, Solihull, B91 3QR",
        startDate: new Date("2026-02-15"),
        endDate: new Date("2026-03-15"),
        status: "COMPLETED",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "Brickwork - Plot 1-4",
        description: "Superstructure brickwork for plots 1-4",
        workflowId: workflow1.id,
        siteName: "Meadow View Estate",
        plot: "1-4",
        location: "Birmingham",
        address: "Meadow Lane, Solihull, B91 3QR",
        startDate: new Date("2026-03-10"),
        endDate: new Date("2026-04-20"),
        status: "IN_PROGRESS",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "Roofing - Plot 1-2",
        description: "Roof trusses and tiling for plots 1 and 2",
        workflowId: workflow1.id,
        siteName: "Meadow View Estate",
        plot: "1-2",
        location: "Birmingham",
        address: "Meadow Lane, Solihull, B91 3QR",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-25"),
        status: "NOT_STARTED",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "First Fix Electrical - Plot 1-4",
        description: "First fix wiring and back boxes",
        workflowId: workflow1.id,
        siteName: "Meadow View Estate",
        plot: "1-4",
        location: "Birmingham",
        address: "Meadow Lane, Solihull, B91 3QR",
        startDate: new Date("2026-04-15"),
        endDate: new Date("2026-05-10"),
        status: "NOT_STARTED",
        assignedToId: contractor2.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "Groundworks - Plot 5-8",
        description: "Foundation excavation and concrete pour for plots 5-8",
        workflowId: workflow1.id,
        siteName: "Meadow View Estate",
        plot: "5-8",
        location: "Birmingham",
        address: "Meadow Lane, Solihull, B91 3QR",
        startDate: new Date("2026-03-20"),
        endDate: new Date("2026-04-20"),
        status: "IN_PROGRESS",
        assignedToId: contractor1.id,
      },
    }),
  ]);

  // Create jobs for Workflow 2 - Oakwood Park
  const jobs2 = await Promise.all([
    prisma.job.create({
      data: {
        name: "Strip Out - Ground Floor",
        description: "Complete strip out of existing ground floor layout",
        workflowId: workflow2.id,
        siteName: "Oakwood Park",
        plot: "Block A - GF",
        location: "Manchester",
        address: "Oakwood Road, Didsbury, M20 6RT",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-28"),
        status: "COMPLETED",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "Structural Works - Block A",
        description: "Steel frame installation and structural modifications",
        workflowId: workflow2.id,
        siteName: "Oakwood Park",
        plot: "Block A",
        location: "Manchester",
        address: "Oakwood Road, Didsbury, M20 6RT",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-04-15"),
        status: "ON_HOLD",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "M&E First Fix - All Floors",
        description: "Mechanical and electrical first fix across all floors",
        workflowId: workflow2.id,
        siteName: "Oakwood Park",
        plot: "Block A - All",
        location: "Manchester",
        address: "Oakwood Road, Didsbury, M20 6RT",
        startDate: new Date("2026-04-15"),
        endDate: new Date("2026-05-30"),
        status: "NOT_STARTED",
        assignedToId: contractor2.id,
      },
    }),
  ]);

  // Create jobs for Workflow 3 - River Court
  const jobs3 = await Promise.all([
    prisma.job.create({
      data: {
        name: "Demolition & Strip Out",
        description: "Remove existing partitions, ceilings, and floor finishes",
        workflowId: workflow3.id,
        siteName: "River Court",
        location: "Leeds",
        address: "River Court, Wellington St, Leeds, LS1 4AP",
        startDate: new Date("2026-01-15"),
        endDate: new Date("2026-02-15"),
        status: "COMPLETED",
        assignedToId: contractor1.id,
      },
    }),
    prisma.job.create({
      data: {
        name: "New Partitions & Ceilings",
        description: "Install new stud partitions and suspended ceilings",
        workflowId: workflow3.id,
        siteName: "River Court",
        location: "Leeds",
        address: "River Court, Wellington St, Leeds, LS1 4AP",
        startDate: new Date("2026-02-20"),
        endDate: new Date("2026-03-25"),
        status: "IN_PROGRESS",
        assignedToId: contractor1.id,
      },
    }),
  ]);

  console.log("Jobs created");

  // Create material orders
  await Promise.all([
    prisma.materialOrder.create({
      data: {
        supplierId: supplier1.id,
        jobId: jobs1[1].id,
        orderDetails: "Bricks - Ibstock Leicester Red Multi, 10,000 units",
        orderType: "Materials",
        status: "CONFIRMED",
        expectedDeliveryDate: new Date("2026-03-18"),
        leadTimeDays: 14,
        items: "Ibstock Leicester Red Multi x10000, Mortar mix x50 bags",
      },
    }),
    prisma.materialOrder.create({
      data: {
        supplierId: supplier3.id,
        jobId: jobs1[2].id,
        orderDetails: "Roof trusses - Fink type, 12 sets",
        orderType: "Materials",
        status: "PENDING",
        expectedDeliveryDate: new Date("2026-03-28"),
        leadTimeDays: 21,
        items: "Fink trusses x12, Ridge board x6, Felt x8 rolls",
      },
    }),
    prisma.materialOrder.create({
      data: {
        supplierId: supplier4.id,
        jobId: jobs1[3].id,
        orderDetails: "Electrical first fix materials - cable, back boxes, consumer units",
        orderType: "Materials",
        status: "ORDERED",
        expectedDeliveryDate: new Date("2026-04-10"),
        leadTimeDays: 7,
        items: "Twin & earth 2.5mm x20 rolls, Back boxes x200, Consumer units x4",
      },
    }),
    prisma.materialOrder.create({
      data: {
        supplierId: supplier2.id,
        jobId: jobs1[0].id,
        orderDetails: "Concrete C30 - 48 cubic metres",
        orderType: "Materials",
        status: "DELIVERED",
        expectedDeliveryDate: new Date("2026-02-20"),
        deliveredDate: new Date("2026-02-20"),
        leadTimeDays: 3,
        items: "Ready-mix C30 x48m³",
      },
    }),
    prisma.materialOrder.create({
      data: {
        supplierId: supplier1.id,
        jobId: jobs2[1].id,
        orderDetails: "Structural steel beams - various sizes",
        orderType: "Materials",
        status: "PENDING",
        expectedDeliveryDate: new Date("2026-03-25"),
        leadTimeDays: 28,
        items: "RSJ 203x133 x6, RSJ 254x146 x4, Base plates x10",
      },
    }),
    prisma.materialOrder.create({
      data: {
        supplierId: supplier2.id,
        jobId: jobs3[1].id,
        orderDetails: "Stud partitioning materials - metal stud and plasterboard",
        orderType: "Materials",
        status: "DELIVERED",
        expectedDeliveryDate: new Date("2026-02-25"),
        deliveredDate: new Date("2026-02-24"),
        leadTimeDays: 5,
        items: "Metal stud 70mm x100, Plasterboard 12.5mm x80 sheets, Screws x10 boxes",
      },
    }),
  ]);

  console.log("Material orders created");

  // Create event log entries
  await prisma.eventLog.createMany({
    data: [
      { type: "WORKFLOW_CREATED", description: "Workflow 'Meadow View Estate - Phase 1' created", workflowId: workflow1.id, userId: siteManager.id, createdAt: new Date("2026-02-01") },
      { type: "WORKFLOW_CREATED", description: "Workflow 'Oakwood Park - Block A' created", workflowId: workflow2.id, userId: siteManager.id, createdAt: new Date("2026-01-20") },
      { type: "WORKFLOW_CREATED", description: "Workflow 'River Court Refurbishment' created", workflowId: workflow3.id, userId: contractManager.id, createdAt: new Date("2026-01-10") },
      { type: "JOB_STARTED", description: "Groundworks started on plots 1-4", workflowId: workflow1.id, jobId: jobs1[0].id, userId: contractor1.id, createdAt: new Date("2026-02-15") },
      { type: "JOB_COMPLETED", description: "Groundworks completed for plots 1-4", workflowId: workflow1.id, jobId: jobs1[0].id, userId: contractor1.id, createdAt: new Date("2026-03-12") },
      { type: "JOB_STARTED", description: "Brickwork started on plots 1-4", workflowId: workflow1.id, jobId: jobs1[1].id, userId: contractor1.id, createdAt: new Date("2026-03-10") },
      { type: "ORDER_PLACED", description: "Brick order placed with Travis Perkins - 10,000 units", workflowId: workflow1.id, jobId: jobs1[1].id, userId: siteManager.id, createdAt: new Date("2026-03-05") },
      { type: "ORDER_DELIVERED", description: "Concrete delivery received - 48m³ C30", workflowId: workflow1.id, jobId: jobs1[0].id, userId: siteManager.id, createdAt: new Date("2026-02-20") },
      { type: "JOB_STARTED", description: "Strip out started at Oakwood Park ground floor", workflowId: workflow2.id, jobId: jobs2[0].id, userId: contractor1.id, createdAt: new Date("2026-02-01") },
      { type: "JOB_COMPLETED", description: "Strip out completed at Oakwood Park ground floor", workflowId: workflow2.id, jobId: jobs2[0].id, userId: contractor1.id, createdAt: new Date("2026-02-26") },
      { type: "JOB_STOPPED", description: "Structural works paused - awaiting engineer sign-off", workflowId: workflow2.id, jobId: jobs2[1].id, userId: siteManager.id, createdAt: new Date("2026-03-08") },
      { type: "JOB_STARTED", description: "Demolition started at River Court", workflowId: workflow3.id, jobId: jobs3[0].id, userId: contractor1.id, createdAt: new Date("2026-01-15") },
      { type: "JOB_COMPLETED", description: "Demolition completed at River Court", workflowId: workflow3.id, jobId: jobs3[0].id, userId: contractor1.id, createdAt: new Date("2026-02-14") },
      { type: "JOB_STARTED", description: "New partitions installation started at River Court", workflowId: workflow3.id, jobId: jobs3[1].id, userId: contractor1.id, createdAt: new Date("2026-02-20") },
      { type: "ORDER_PLACED", description: "Roof truss order placed with Marley - 12 sets", workflowId: workflow1.id, jobId: jobs1[2].id, userId: siteManager.id, createdAt: new Date("2026-03-07") },
      { type: "NOTIFICATION", description: "Structural steel delivery overdue for Oakwood Park", workflowId: workflow2.id, jobId: jobs2[1].id, userId: null, createdAt: new Date("2026-03-09") },
      { type: "JOB_STARTED", description: "Groundworks started on plots 5-8", workflowId: workflow1.id, jobId: jobs1[4].id, userId: contractor1.id, createdAt: new Date("2026-03-20") },
      { type: "USER_ACTION", description: "John Hudson updated programme for Meadow View Phase 1", workflowId: workflow1.id, userId: siteManager.id, createdAt: new Date("2026-03-08") },
    ],
  });

  console.log("Event log entries created");

  // Create job actions
  await prisma.jobAction.createMany({
    data: [
      { jobId: jobs1[0].id, userId: contractor1.id, action: "start", notes: "Starting groundworks on plots 1-4", createdAt: new Date("2026-02-15") },
      { jobId: jobs1[0].id, userId: contractor1.id, action: "complete", notes: "All foundations poured and cured", createdAt: new Date("2026-03-12") },
      { jobId: jobs1[1].id, userId: contractor1.id, action: "start", notes: "Commencing brickwork", createdAt: new Date("2026-03-10") },
      { jobId: jobs2[0].id, userId: contractor1.id, action: "start", notes: "Strip out beginning", createdAt: new Date("2026-02-01") },
      { jobId: jobs2[0].id, userId: contractor1.id, action: "complete", notes: "Strip out finished ahead of schedule", createdAt: new Date("2026-02-26") },
      { jobId: jobs2[1].id, userId: siteManager.id, action: "stop", notes: "Paused pending structural engineer approval", createdAt: new Date("2026-03-08") },
      { jobId: jobs3[0].id, userId: contractor1.id, action: "start", notes: "Demolition started", createdAt: new Date("2026-01-15") },
      { jobId: jobs3[0].id, userId: contractor1.id, action: "complete", notes: "All demolition complete, site cleared", createdAt: new Date("2026-02-14") },
      { jobId: jobs3[1].id, userId: contractor1.id, action: "start", notes: "Starting partition walls", createdAt: new Date("2026-02-20") },
    ],
  });

  console.log("Job actions created");
  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
