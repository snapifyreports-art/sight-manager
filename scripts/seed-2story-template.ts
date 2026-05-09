/**
 * Seed the "2 Story House" plot template from the spec Keith provided
 * (Downloads/2 story plot template.xlsx — 2 Story house -765 - 775 - 923 -
 * 990 - 1047 All variations).
 *
 * Run once: `npx tsx scripts/seed-2story-template.ts`
 *
 * Idempotent on the template name: if one with the same name exists, the
 * script aborts so we don't accidentally double-up.
 */

import { PrismaClient } from "@prisma/client";
import { resequenceTopLevelStages } from "../src/lib/template-pack-children";

const prisma = new PrismaClient();

const TEMPLATE_NAME = "2 Story House (765 / 775 / 923 / 990 / 1047)";
const TEMPLATE_TYPE = "2 STOREY";
const TEMPLATE_DESCRIPTION =
  "All variations — full build sequence from foundation through externals.";

interface OrderSpec {
  itemsDescription: string;
  anchorAmount: number;
  anchorUnit: "DAYS" | "WEEKS";
  leadTimeAmount: number;
  leadTimeUnit: "DAYS" | "WEEKS";
}

interface SubJobSpec {
  name: string;
  durationDays: number;
  order?: OrderSpec;
}

interface StageSpec {
  name: string;
  /** Atomic stages have no sub-jobs; durationDays applies to the stage itself. */
  durationDays?: number;
  subJobs?: SubJobSpec[];
}

const STAGES: StageSpec[] = [
  {
    name: "Foundation",
    subJobs: [
      { name: "Dig & pour", durationDays: 2 },
      { name: "Brickwork", durationDays: 2 },
      { name: "Drainage", durationDays: 3 },
      { name: "Spantherm", durationDays: 1 },
      { name: "Concrete slab", durationDays: 1 },
      { name: "Scaff matt", durationDays: 1 },
    ],
  },
  {
    name: "Superstructure",
    subJobs: [
      {
        name: "Brickwork 1st lift",
        durationDays: 2,
        order: {
          itemsDescription: "Lintels / formers / meter boxes",
          anchorAmount: 1,
          anchorUnit: "WEEKS",
          leadTimeAmount: 2,
          leadTimeUnit: "WEEKS",
        },
      },
      { name: "Scaff 1st", durationDays: 1 },
      { name: "Brickwork 2nd lift", durationDays: 1 },
      { name: "Scaff 2nd lift", durationDays: 1 },
      {
        name: "Joist (joiners)",
        durationDays: 1,
        order: {
          itemsDescription: "Joists",
          anchorAmount: 1,
          anchorUnit: "WEEKS",
          leadTimeAmount: 3,
          leadTimeUnit: "WEEKS",
        },
      },
      { name: "Brickwork 3rd", durationDays: 3 },
      { name: "Scaff 3rd", durationDays: 1 },
      { name: "Brickwork 4th", durationDays: 1 },
      { name: "Scaff 4th", durationDays: 1 },
      {
        name: "Truss",
        durationDays: 1,
        order: {
          itemsDescription: "Trusses",
          anchorAmount: 1,
          anchorUnit: "WEEKS",
          leadTimeAmount: 4,
          leadTimeUnit: "WEEKS",
        },
      },
      { name: "Brick pikes", durationDays: 1 },
      {
        name: "Roofers felt batten tile",
        durationDays: 1,
        order: {
          itemsDescription: "Felt, batten, tile",
          anchorAmount: 3,
          anchorUnit: "DAYS",
          leadTimeAmount: 1,
          leadTimeUnit: "WEEKS",
        },
      },
    ],
  },
  {
    name: "1st Fix",
    subJobs: [
      {
        name: "Joiners",
        durationDays: 1,
        order: {
          itemsDescription: "Scant timber, internal door frames",
          anchorAmount: 1,
          anchorUnit: "WEEKS",
          leadTimeAmount: 1,
          leadTimeUnit: "WEEKS",
        },
      },
      { name: "Sparks", durationDays: 1 },
      { name: "Plumber", durationDays: 1 },
    ],
  },
  {
    name: "Windows & Doors",
    subJobs: [{ name: "Window fitters", durationDays: 1 }],
  },
  {
    name: "Plasterers",
    subJobs: [
      {
        name: "Plaster",
        durationDays: 2,
        order: {
          itemsDescription: "Boards, skim & beads",
          anchorAmount: 1,
          anchorUnit: "DAYS",
          leadTimeAmount: 3,
          leadTimeUnit: "DAYS",
        },
      },
    ],
  },
  {
    name: "2nd Fix",
    subJobs: [
      {
        name: "Joiners",
        durationDays: 1,
        order: {
          itemsDescription: "Internal doors, skirts, architrave",
          anchorAmount: 1,
          anchorUnit: "WEEKS",
          leadTimeAmount: 1,
          leadTimeUnit: "WEEKS",
        },
      },
      { name: "Sparks", durationDays: 1 },
      { name: "Plumber", durationDays: 1 },
    ],
  },
  {
    name: "Paint",
    subJobs: [{ name: "Painters", durationDays: 2 }],
  },
  {
    // Atomic stage — Excel listed "final" with 3 days and no sub-job.
    name: "Final",
    durationDays: 3,
  },
  {
    name: "Externals",
    subJobs: [
      { name: "Driveway, edgings & paths", durationDays: 2 },
      { name: "Tarmac", durationDays: 1 },
      { name: "Flagging", durationDays: 1 },
    ],
  },
  {
    name: "Fencer",
    subJobs: [
      {
        name: "Boundary fence & gate",
        durationDays: 2,
        order: {
          itemsDescription: "Post, feather edge and postmix",
          anchorAmount: 3,
          anchorUnit: "DAYS",
          leadTimeAmount: 1,
          leadTimeUnit: "WEEKS",
        },
      },
    ],
  },
];

async function main() {
  const existing = await prisma.plotTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
    select: { id: true },
  });
  if (existing) {
    console.error(
      `Template "${TEMPLATE_NAME}" already exists (id=${existing.id}). Aborting to avoid duplicates.`,
    );
    process.exit(1);
  }

  const templateId = await prisma.$transaction(async (tx) => {
    // Lots of writes in this txn (template + 10 stages + ~30 children +
    // 7 orders + a full resequence). Default 5s isn't enough on a cold
    // pooled connection.
    const template = await tx.plotTemplate.create({
      data: {
        name: TEMPLATE_NAME,
        typeLabel: TEMPLATE_TYPE,
        description: TEMPLATE_DESCRIPTION,
      },
    });

    let stageCursorWeek = 1;
    let stageSortOrder = 0;

    for (const stage of STAGES) {
      // Compute the stage's week span from its sub-jobs (or its own
      // durationDays if atomic). Cache will be re-derived by
      // resequenceTopLevelStages at the end anyway.
      const stageDays = stage.subJobs
        ? stage.subJobs.reduce((sum, sj) => sum + sj.durationDays, 0)
        : (stage.durationDays ?? 5);
      const stageWeeks = Math.max(1, Math.ceil(stageDays / 5));

      const parent = await tx.templateJob.create({
        data: {
          templateId: template.id,
          name: stage.name,
          sortOrder: stageSortOrder,
          startWeek: stageCursorWeek,
          endWeek: stageCursorWeek + stageWeeks - 1,
          // Atomic stages carry their own duration; parents-with-children
          // leave it null and derive from kids.
          durationDays: stage.subJobs ? null : (stage.durationDays ?? null),
        },
      });

      if (stage.subJobs) {
        let dayCursor = 0;
        let childSortOrder = 0;
        for (const sj of stage.subJobs) {
          const startWeek =
            stageCursorWeek + Math.floor(dayCursor / 5);
          const endWeek =
            stageCursorWeek +
            Math.floor((dayCursor + sj.durationDays - 1) / 5);

          const child = await tx.templateJob.create({
            data: {
              templateId: template.id,
              parentId: parent.id,
              name: sj.name,
              sortOrder: childSortOrder,
              startWeek,
              endWeek,
              durationDays: sj.durationDays,
            },
          });

          if (sj.order) {
            await tx.templateOrder.create({
              data: {
                templateJobId: child.id,
                itemsDescription: sj.order.itemsDescription,
                anchorType: "JOB_START",
                anchorJobId: child.id,
                anchorAmount: sj.order.anchorAmount,
                anchorUnit: sj.order.anchorUnit,
                anchorDirection: "BEFORE",
                leadTimeAmount: sj.order.leadTimeAmount,
                leadTimeUnit: sj.order.leadTimeUnit,
                // Cache offsets — resequencer-equivalent for orders is
                // template-order-offsets.ts on read; -2/0 are safe defaults.
                orderWeekOffset: -2,
                deliveryWeekOffset: 0,
              },
            });
          }

          dayCursor += sj.durationDays;
          childSortOrder += 1;
        }
      }

      stageSortOrder += 1;
      stageCursorWeek += stageWeeks;
    }

    // Re-derive every cache from canonical fields. This is the SSOT
    // contract — never trust the values we just wrote, recompute them.
    await resequenceTopLevelStages(tx, template.id);

    return template.id;
  }, { timeout: 60_000, maxWait: 10_000 });

  // Quick verification dump.
  const final = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
            include: { orders: true },
          },
          orders: true,
        },
      },
    },
  });

  if (!final) {
    throw new Error("Template vanished after creation — should be impossible");
  }

  const totalChildren = final.jobs.reduce((n, j) => n + j.children.length, 0);
  const totalOrders =
    final.jobs.reduce((n, j) => n + j.orders.length, 0) +
    final.jobs.reduce(
      (n, j) => n + j.children.reduce((cn, c) => cn + c.orders.length, 0),
      0,
    );

  console.log(`\nCreated template "${final.name}" (id=${final.id})`);
  console.log(
    `  ${final.jobs.length} stages, ${totalChildren} sub-jobs, ${totalOrders} orders`,
  );
  for (const j of final.jobs) {
    const subSummary = j.children.length
      ? `${j.children.length} sub-jobs`
      : `atomic ${j.durationDays ?? "?"}d`;
    console.log(
      `  • ${j.name} [w${j.startWeek}-${j.endWeek}] (${subSummary})`,
    );
    for (const c of j.children) {
      const orderTag =
        c.orders.length > 0
          ? ` 🛒 ${c.orders[0].itemsDescription}`
          : "";
      console.log(
        `      └─ ${c.name} [w${c.startWeek}-${c.endWeek}, ${c.durationDays}d]${orderTag}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
