/**
 * Cleanup script — Keith authorised May 2026.
 *
 * Deletes:
 *   - 5 test sites (Ryan's, Keith's, Paul's, QA_E2E_TEST, SMOKE_TEST — Staggered Six)
 *     ↳ cascades to plots / jobs / orders / snags / events / handover / docs
 *   - 13 plot templates (everything except "2 Story House (765 / 775 / 923 / 990 / 1047)")
 *     ↳ cascades to template jobs / orders / variants / audit events / consumption logs
 *   - Every supplier whose name contains "Test Supplier"
 *     ↳ cascades to SupplierMaterial; sets TemplateOrder.supplierId to NULL
 *
 * Keeps:
 *   - Old Hall Village (real site, Keith confirmed)
 *   - "2 Story House (765 / 775 / 923 / 990 / 1047)" template + its audit log
 *
 * Bonus tidy:
 *   - Any MaterialOrder still linked to a deleted Test Supplier (which
 *     would block the supplier delete because that FK is RESTRICT) —
 *     these are test-data orders sitting on the surviving Old Hall
 *     Village plots, and they're cleared first.
 *   - Orphan SiteDocument rows whose plot/site/contact are all gone.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEEP_SITE_NAME = "Old Hall Village";
const KEEP_TEMPLATE_NAME = "2 Story House (765 / 775 / 923 / 990 / 1047)";
const SUPPLIER_NEEDLE = "Test Supplier";

async function main() {
  console.log("Starting cleanup. Old Hall Village + 2-storey template are kept.\n");

  // ---------- 1. Sites ----------
  const sitesToDelete = await prisma.site.findMany({
    where: { name: { not: KEEP_SITE_NAME } },
    select: { id: true, name: true },
  });
  console.log(`Sites to delete: ${sitesToDelete.length}`);
  for (const s of sitesToDelete) {
    await prisma.site.delete({ where: { id: s.id } });
    console.log(`  ✓ deleted site: ${s.name}`);
  }

  // ---------- 2. Plot templates (except the 2-storey) ----------
  const templatesToDelete = await prisma.plotTemplate.findMany({
    where: { name: { not: KEEP_TEMPLATE_NAME } },
    select: { id: true, name: true },
  });
  console.log(`\nPlot templates to delete: ${templatesToDelete.length}`);
  for (const t of templatesToDelete) {
    await prisma.plotTemplate.delete({ where: { id: t.id } });
    console.log(`  ✓ deleted template: ${t.name}`);
  }

  // ---------- 3. Pre-clear test-supplier orders that survived the cascade ----------
  // MaterialOrder.supplier is RESTRICT, so a Test Supplier with any
  // surviving order would block the supplier delete. Old Hall Village
  // is the only place where such orders could survive.
  const testSuppliers = await prisma.supplier.findMany({
    where: { name: { contains: SUPPLIER_NEEDLE, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const testSupplierIds = testSuppliers.map((s) => s.id);
  if (testSupplierIds.length > 0) {
    const blockingOrders = await prisma.materialOrder.findMany({
      where: { supplierId: { in: testSupplierIds } },
      include: {
        plot: { select: { name: true, site: { select: { name: true } } } },
      },
    });
    if (blockingOrders.length > 0) {
      console.log(
        `\nClearing ${blockingOrders.length} surviving MaterialOrder rows linked to Test Suppliers:`,
      );
      for (const o of blockingOrders) {
        const where = o.plot
          ? `${o.plot.site?.name ?? "?"} > ${o.plot.name}`
          : "(no plot)";
        console.log(`  • order ${o.id} on ${where}`);
      }
      await prisma.materialOrder.deleteMany({
        where: { supplierId: { in: testSupplierIds } },
      });
      console.log(`  ✓ deleted ${blockingOrders.length} order rows`);
    }
  }

  // ---------- 4. Delete the test suppliers ----------
  console.log(`\nSuppliers to delete: ${testSuppliers.length}`);
  // Bulk delete in one go — much faster than per-row.
  const deletedCount = await prisma.supplier.deleteMany({
    where: { id: { in: testSupplierIds } },
  });
  console.log(`  ✓ deleted ${deletedCount.count} test suppliers`);

  // ---------- 5. Orphan tidy ----------
  console.log("\nOrphan tidy:");

  // SiteDocument with no site, plot, contact, or job (all FK nulls because
  // their parents were cascaded — these would otherwise sit forever).
  const orphanDocs = await prisma.siteDocument.deleteMany({
    where: {
      siteId: null,
      plotId: null,
      jobId: null,
      contactId: null,
    },
  });
  console.log(`  ✓ ${orphanDocs.count} orphan SiteDocument rows removed`);

  // TemplateOrder rows that lost their supplier (SetNull leaves the row
  // alive). These survive on the kept template — we want to KEEP them
  // (the order is still meaningful, just unlinked). Just report.
  const unlinkedTemplateOrders = await prisma.templateOrder.count({
    where: { supplierId: null },
  });
  console.log(
    `  · ${unlinkedTemplateOrders} TemplateOrder rows now have null supplier (kept; you can re-link them)`,
  );

  // ---------- 6. Final counts ----------
  const [siteCount, plotCount, templateCount, supplierCount, orderCount] =
    await Promise.all([
      prisma.site.count(),
      prisma.plot.count(),
      prisma.plotTemplate.count(),
      prisma.supplier.count(),
      prisma.materialOrder.count(),
    ]);
  console.log("\n=== After cleanup ===");
  console.log(`  Sites:           ${siteCount}`);
  console.log(`  Plots:           ${plotCount}`);
  console.log(`  Templates:       ${templateCount}`);
  console.log(`  Suppliers:       ${supplierCount}`);
  console.log(`  MaterialOrders:  ${orderCount}`);
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("\nCLEANUP FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
