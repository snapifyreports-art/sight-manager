import { PrismaClient } from "@prisma/client";
import { addWeeks, addDays } from "date-fns";

const prisma = new PrismaClient();

// Template IDs
const TEMPLATES = {
  willow:    "cmmqnozjw0000ph2kemxws1rn",  // The Willow
  oakwood:   "cmmqp271m001zph2kiz98f4um",  // The Oakwood
  briarwood: "cmmqrm8hn000ephc4gqahyrzd",  // The Briarwood
  riverside: "cmmqw30x30088phc47t3spibn",  // The Riverside
};

// 5 plots per group — cycle through house types
const TEMPLATE_CYCLE = [
  TEMPLATES.willow,
  TEMPLATES.oakwood,
  TEMPLATES.briarwood,
  TEMPLATES.riverside,
  TEMPLATES.oakwood,
];

// User IDs
const USERS = {
  ryan: "cmmjc96zd0002phk49dalsyrs",  // Ryan Davies
  ross: "cmmjc96pc0000phk4jsjlinlv",  // Ross Mitchell
};

const TODAY = new Date("2026-03-30");

// ─── Template cache ───────────────────────────────────────────────────────────

async function loadTemplate(templateId) {
  return prisma.plotTemplate.findUnique({
    where: { id: templateId },
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
            include: {
              orders: { include: { items: true } },
            },
          },
          orders: { include: { items: true } },
        },
      },
    },
  });
}

// ─── Order creation ───────────────────────────────────────────────────────────

async function createOrderFromTemplate(tx, jobId, jobStartDate, templateOrder) {
  if (!templateOrder.supplierId) return;

  const dateOfOrder = addWeeks(jobStartDate, templateOrder.orderWeekOffset);

  let leadTimeDays = null;
  if (templateOrder.leadTimeAmount && templateOrder.leadTimeUnit) {
    leadTimeDays =
      templateOrder.leadTimeUnit === "weeks"
        ? templateOrder.leadTimeAmount * 7
        : templateOrder.leadTimeAmount;
  } else if (templateOrder.deliveryWeekOffset > 0) {
    leadTimeDays = templateOrder.deliveryWeekOffset * 7;
  }

  const expectedDeliveryDate = leadTimeDays
    ? addDays(dateOfOrder, leadTimeDays)
    : addWeeks(dateOfOrder, templateOrder.deliveryWeekOffset);

  // Realistic status based on dates relative to today
  let status = "PENDING";
  if (dateOfOrder <= TODAY) {
    status = expectedDeliveryDate <= TODAY ? "DELIVERED" : "ORDERED";
  }

  await tx.materialOrder.create({
    data: {
      supplierId: templateOrder.supplierId,
      jobId,
      itemsDescription: templateOrder.itemsDescription,
      dateOfOrder,
      expectedDeliveryDate,
      leadTimeDays,
      status,
      automated: true,
      orderItems: templateOrder.items.length
        ? {
            create: templateOrder.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
              totalCost: item.quantity * item.unitCost,
            })),
          }
        : undefined,
    },
  });
}

// ─── Job creation (mirrors apply-template-helpers.ts) ────────────────────────

async function createJobsFromTemplate(tx, plotId, plotStartDate, templateJobs) {
  for (const templateJob of templateJobs) {
    if (templateJob.children && templateJob.children.length > 0) {
      // Hierarchical: one Job per child
      for (const child of templateJob.children) {
        const jobStartDate = addWeeks(plotStartDate, child.startWeek - 1);
        const jobEndDate = addDays(addWeeks(plotStartDate, child.endWeek - 1), 6);

        const job = await tx.job.create({
          data: {
            name: child.name,
            description: child.description,
            plotId,
            startDate: jobStartDate,
            endDate: jobEndDate,
            originalStartDate: jobStartDate,
            originalEndDate: jobEndDate,
            status: "NOT_STARTED",
            stageCode: child.stageCode || null,
            weatherAffected: child.weatherAffected ?? false,
            weatherAffectedType: child.weatherAffectedType ?? null,
            parentStage: templateJob.name,
            sortOrder: templateJob.sortOrder * 100 + child.sortOrder,
          },
        });

        if (child.contactId) {
          await tx.jobContractor.create({
            data: { jobId: job.id, contactId: child.contactId },
          });
        }

        for (const o of child.orders) {
          await createOrderFromTemplate(tx, job.id, jobStartDate, o);
        }
      }

      // Parent-level orders → attach to first child
      if (templateJob.orders.length > 0) {
        const firstChild = await tx.job.findFirst({
          where: { plotId, parentStage: templateJob.name },
          orderBy: { sortOrder: "asc" },
        });
        if (firstChild) {
          const firstChildStart = addWeeks(plotStartDate, templateJob.children[0].startWeek - 1);
          for (const o of templateJob.orders) {
            await createOrderFromTemplate(tx, firstChild.id, firstChildStart, o);
          }
        }
      }
    } else {
      // Flat (legacy)
      const jobStartDate = addWeeks(plotStartDate, templateJob.startWeek - 1);
      const jobEndDate = addDays(addWeeks(plotStartDate, templateJob.endWeek - 1), 6);

      const job = await tx.job.create({
        data: {
          name: templateJob.name,
          description: templateJob.description,
          plotId,
          startDate: jobStartDate,
          endDate: jobEndDate,
          originalStartDate: jobStartDate,
          originalEndDate: jobEndDate,
          status: "NOT_STARTED",
          stageCode: templateJob.stageCode || null,
          weatherAffected: templateJob.weatherAffected ?? false,
          weatherAffectedType: templateJob.weatherAffectedType ?? null,
          sortOrder: templateJob.sortOrder,
        },
      });

      if (templateJob.contactId) {
        await tx.jobContractor.create({
          data: { jobId: job.id, contactId: templateJob.contactId },
        });
      }

      for (const o of templateJob.orders) {
        await createOrderFromTemplate(tx, job.id, jobStartDate, o);
      }
    }
  }
}

// ─── Site creation ────────────────────────────────────────────────────────────

async function createSiteWithPlots(siteName, userId, siteStartDate, location, address) {
  console.log(`\nCreating "${siteName}"...`);

  // Create site
  const site = await prisma.site.create({
    data: {
      name: siteName,
      location,
      address,
      status: "ACTIVE",
      createdById: userId,
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "SITE_CREATED",
      description: `Site "${siteName}" created`,
      siteId: site.id,
      userId,
    },
  });

  console.log(`  Site ID: ${site.id}`);

  // Load templates once
  const templateCache = {};
  for (const id of Object.values(TEMPLATES)) {
    templateCache[id] = await loadTemplate(id);
  }

  const NUM_GROUPS = 6;      // 6 groups × 5 plots = 30 plots
  const PLOTS_PER_GROUP = 5;
  let plotCount = 0;

  for (let group = 0; group < NUM_GROUPS; group++) {
    // Each group starts one week after the previous
    const groupStartDate = addWeeks(siteStartDate, group);

    for (let idx = 0; idx < PLOTS_PER_GROUP; idx++) {
      const plotNum = group * PLOTS_PER_GROUP + idx + 1;
      const templateId = TEMPLATE_CYCLE[idx];
      const template = templateCache[templateId];
      const plotName = `Plot ${plotNum}`;

      await prisma.$transaction(async (tx) => {
        const plot = await tx.plot.create({
          data: {
            name: plotName,
            plotNumber: plotNum.toString(),
            houseType: template.typeLabel || null,
            siteId: site.id,
          },
        });


        await createJobsFromTemplate(tx, plot.id, groupStartDate, template.jobs);

        await tx.eventLog.create({
          data: {
            type: "PLOT_CREATED",
            description: `Plot "${plotName}" created from template "${template.name}"`,
            siteId: site.id,
            plotId: plot.id,
            userId,
          },
        });
      }, { timeout: 60000 });

      plotCount++;
      process.stdout.write(`\r  Plots created: ${plotCount}/30`);
    }
  }

  console.log(`\n  Done. ${plotCount} plots across ${NUM_GROUPS} groups.`);
  return site;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  // Ryan's site — starts 7 Apr 2026 (first Monday after today)
  await createSiteWithPlots(
    "Ryan's Site",
    USERS.ryan,
    new Date("2026-04-07"),
    "Macclesfield, Cheshire",
    "Bramble Lane, Macclesfield SK10 1AA"
  );

  // Keith's site — starts 14 Apr 2026 (one week after Ryan's)
  await createSiteWithPlots(
    "Keith's Site",
    USERS.ross,
    new Date("2026-04-14"),
    "Buxton, Derbyshire",
    "Moorland Road, Buxton SK17 9BT"
  );

  console.log("\nAll done!");
}

run().catch(console.error).finally(() => prisma.$disconnect());
