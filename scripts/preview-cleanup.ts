/**
 * READ-ONLY preview of what the cleanup would delete. No writes.
 * Run: npx tsx scripts/preview-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEEP_TEMPLATE_NAME = "2 Story House (765 / 775 / 923 / 990 / 1047)";
const SUPPLIER_NEEDLE = "Test Supplier";

async function main() {
  const [sites, suppliers, templates] = await Promise.all([
    prisma.site.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { plots: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { name: { contains: SUPPLIER_NEEDLE, mode: "insensitive" } },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            orders: true,
            templateOrders: true,
            materials: true,
          },
        },
      },
    }),
    prisma.plotTemplate.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: { jobs: true, materials: true, sourcedPlots: true },
        },
      },
    }),
  ]);

  // Count plots/jobs/orders that would be removed by site cascade
  const plotIds = (
    await prisma.plot.findMany({
      where: { siteId: { in: sites.map((s) => s.id) } },
      select: { id: true },
    })
  ).map((p) => p.id);
  const [jobCount, orderCount, snagCount, eventCount] = await Promise.all([
    prisma.job.count({ where: { plotId: { in: plotIds } } }),
    prisma.materialOrder.count({ where: { plotId: { in: plotIds } } }),
    prisma.snag.count({ where: { plotId: { in: plotIds } } }),
    prisma.eventLog.count({ where: { plotId: { in: plotIds } } }),
  ]);

  console.log("\n=== SITES TO DELETE ===");
  if (sites.length === 0) {
    console.log("(none)");
  } else {
    for (const s of sites) {
      console.log(`  • ${s.name} — ${s._count.plots} plots — id=${s.id}`);
    }
    console.log(
      `\n  Cascade impact: ${plotIds.length} plots, ${jobCount} jobs, ${orderCount} material orders, ${snagCount} snags, ${eventCount} event-log rows.`,
    );
  }

  console.log("\n=== SUPPLIERS TO DELETE (name contains \"Test Supplier\") ===");
  if (suppliers.length === 0) {
    console.log("(none)");
  } else {
    for (const s of suppliers) {
      const c = s._count;
      console.log(
        `  • ${s.name} — ${c.orders} live orders, ${c.templateOrders} template orders, ${c.materials} preferred items — id=${s.id}`,
      );
    }
    console.log(
      "\n  Note: Supplier delete uses onDelete: SetNull on linked rows — orders/items get unlinked, NOT deleted. Safe.",
    );
  }

  console.log("\n=== PLOT TEMPLATES TO DELETE ===");
  const toDelete = templates.filter((t) => t.name !== KEEP_TEMPLATE_NAME);
  const toKeep = templates.filter((t) => t.name === KEEP_TEMPLATE_NAME);
  if (toDelete.length === 0) {
    console.log("(none)");
  } else {
    for (const t of toDelete) {
      const c = t._count;
      console.log(
        `  • ${t.name}${t.typeLabel ? ` [${t.typeLabel}]` : ""} — ${c.jobs} jobs, ${c.materials} materials, ${c.sourcedPlots} sourced plots — id=${t.id}`,
      );
    }
  }
  console.log("\n=== PLOT TEMPLATES KEPT ===");
  if (toKeep.length === 0) {
    console.log(
      `  ⚠ WARNING — no template named "${KEEP_TEMPLATE_NAME}" found. Aborting would leave you with no templates.`,
    );
  } else {
    for (const t of toKeep) {
      console.log(`  ✓ ${t.name} — id=${t.id}`);
    }
  }

  console.log("\nNothing has been deleted. Confirm next.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
