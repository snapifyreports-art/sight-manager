/**
 * Seeds a test site with the Willow template applied to 2 plots so we can
 * visually inspect the UI hierarchy rendering.
 * The site is labelled "__UI_TEST__" so it's easy to spot and clean.
 *
 * Run:    npx tsx scripts/seed-ui-test.ts
 * Clean:  npx tsx scripts/seed-ui-test.ts --clean
 */
import { PrismaClient } from "@prisma/client";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const prisma = new PrismaClient();
const SITE_NAME = "__UI_TEST__";

async function clean() {
  const site = await prisma.site.findFirst({ where: { name: SITE_NAME } });
  if (!site) return console.log("nothing to clean");
  await prisma.site.delete({ where: { id: site.id } });
  console.log("✓ cleaned");
}

async function seed() {
  await clean();
  const keith = await prisma.user.findUnique({ where: { email: "keith@sightmanager.com" } });
  if (!keith) throw new Error("Keith user not found");
  const template = await prisma.plotTemplate.findFirst({
    where: { name: "The Willow" },
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: { orderBy: { sortOrder: "asc" }, include: { orders: { include: { items: true } } } },
          orders: { include: { items: true } },
        },
      },
    },
  });
  if (!template) throw new Error("The Willow template not found");

  const site = await prisma.site.create({
    data: {
      name: SITE_NAME,
      location: "Manchester",
      postcode: "M1 1AA",
      createdById: keith.id,
      assignedToId: keith.id,
      userAccess: { create: [{ userId: keith.id }] },
    },
  });
  console.log(`✓ site created: ${site.id}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const plotNumber of ["1", "2"]) {
    await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.create({
        data: {
          siteId: site.id,
          plotNumber,
          name: `Plot ${plotNumber}`,
          houseType: template.typeLabel,
        },
      });
      await createJobsFromTemplate(
        tx,
        plot.id,
        today,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.jobs as any,
        null,
        keith.id
      );
      console.log(`  ✓ plot ${plotNumber} seeded`);
    }, { timeout: 60_000 });
  }

  console.log(`\nUI test data ready. Visit: http://localhost:3002/sites/${site.id}`);
}

const mode = process.argv[2] === "--clean" ? "clean" : "seed";
(async () => {
  if (mode === "clean") await clean();
  else await seed();
  await prisma.$disconnect();
})();
