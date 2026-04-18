/**
 * Delete all sites (fake test data) and all their cascaded children.
 * Preserves reference data: Users, Suppliers, Contacts, PlotTemplates,
 * TemplateJobs/Orders/Items, SupplierMaterials, UserPermissions,
 * PushSubscriptions, NotificationPreferences.
 *
 * Run: npx tsx scripts/wipe-fake-sites.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const before = {
    sites: await prisma.site.count(),
    plots: await prisma.plot.count(),
    jobs: await prisma.job.count(),
    orders: await prisma.materialOrder.count(),
    orderItems: await prisma.orderItem.count(),
    events: await prisma.eventLog.count(),
    snags: await prisma.snag.count(),
    handover: await prisma.handoverChecklist.count(),
    userSites: await prisma.userSite.count(),
    jobActions: await prisma.jobAction.count(),
    jobContractors: await prisma.jobContractor.count(),
    rainedOff: await prisma.rainedOffDay.count(),
    documents: await prisma.siteDocument.count(),
    // reference data — should not change
    users: await prisma.user.count(),
    suppliers: await prisma.supplier.count(),
    supplierMaterials: await prisma.supplierMaterial.count(),
    contacts: await prisma.contact.count(),
    plotTemplates: await prisma.plotTemplate.count(),
    templateJobs: await prisma.templateJob.count(),
    templateOrders: await prisma.templateOrder.count(),
    templateOrderItems: await prisma.templateOrderItem.count(),
    userPerms: await prisma.userPermission.count(),
    pushSubs: await prisma.pushSubscription.count(),
    notifPrefs: await prisma.notificationPreference.count(),
  };

  console.log("Before:", before);

  // Delete all sites → cascades down
  const result = await prisma.site.deleteMany({});
  console.log(`\n✓ Deleted ${result.count} site(s) — cascades applied\n`);

  // Clean up EventLogs that had no siteId but did have plotId/jobId (should be zero since cascade SetNull leaves them)
  // They become orphaned event logs that point to nothing — still valid DB-wise but noise.
  // Keep them: they form a historical audit trail tied to userId. (User decides if they want them gone.)

  const after = {
    sites: await prisma.site.count(),
    plots: await prisma.plot.count(),
    jobs: await prisma.job.count(),
    orders: await prisma.materialOrder.count(),
    orderItems: await prisma.orderItem.count(),
    events: await prisma.eventLog.count(),
    snags: await prisma.snag.count(),
    handover: await prisma.handoverChecklist.count(),
    userSites: await prisma.userSite.count(),
    jobActions: await prisma.jobAction.count(),
    jobContractors: await prisma.jobContractor.count(),
    rainedOff: await prisma.rainedOffDay.count(),
    documents: await prisma.siteDocument.count(),
    // reference data
    users: await prisma.user.count(),
    suppliers: await prisma.supplier.count(),
    supplierMaterials: await prisma.supplierMaterial.count(),
    contacts: await prisma.contact.count(),
    plotTemplates: await prisma.plotTemplate.count(),
    templateJobs: await prisma.templateJob.count(),
    templateOrders: await prisma.templateOrder.count(),
    templateOrderItems: await prisma.templateOrderItem.count(),
    userPerms: await prisma.userPermission.count(),
    pushSubs: await prisma.pushSubscription.count(),
    notifPrefs: await prisma.notificationPreference.count(),
  };

  console.log("After:", after);

  // Verify reference data is intact
  const preservedKeys = [
    "users",
    "suppliers",
    "supplierMaterials",
    "contacts",
    "plotTemplates",
    "templateJobs",
    "templateOrders",
    "templateOrderItems",
    "userPerms",
    "pushSubs",
    "notifPrefs",
  ] as const;

  console.log("\n=== Reference data integrity check ===");
  let ok = true;
  for (const k of preservedKeys) {
    const b = (before as Record<string, number>)[k];
    const a = (after as Record<string, number>)[k];
    const pass = a === b;
    ok = ok && pass;
    console.log(`  ${pass ? "✓" : "✗"} ${k}: ${b} → ${a}`);
  }

  // Verify all site-scoped data is gone
  console.log("\n=== Site-scoped data cleared ===");
  const cleared = ["sites", "plots", "jobs", "orders", "orderItems", "snags", "handover", "userSites", "jobActions", "jobContractors", "rainedOff", "documents"] as const;
  for (const k of cleared) {
    const a = (after as Record<string, number>)[k];
    const pass = a === 0;
    ok = ok && pass;
    console.log(`  ${pass ? "✓" : "✗"} ${k} = ${a}`);
  }

  // EventLog special: we allow these to survive as audit history (SetNull on plot/job/user);
  // site-scoped eventlogs (with siteId) cascade-delete. Anything remaining is an orphan log.
  console.log(`\n  (info) EventLog: ${before.events} → ${after.events} (site-scoped cascaded; user/plot/job SetNull survive)`);

  // Sanity: referential integrity of preserved data
  console.log("\n=== Reference data still linked correctly ===");
  const supWithMatCount = await prisma.supplier.count({ where: { materials: { some: {} } } });
  console.log(`  Suppliers with ≥1 material: ${supWithMatCount}/${after.suppliers}`);

  const tplWithJobCount = await prisma.plotTemplate.count({ where: { jobs: { some: {} } } });
  console.log(`  PlotTemplates with ≥1 job:  ${tplWithJobCount}/${after.plotTemplates}`);

  const tplJobsWithOrdersCount = await prisma.templateJob.count({ where: { orders: { some: {} } } });
  console.log(`  TemplateJobs with ≥1 order: ${tplJobsWithOrdersCount}/${after.templateJobs}`);

  const usersWithPermsCount = await prisma.user.count({ where: { permissions: { some: {} } } });
  console.log(`  Users with ≥1 permission:   ${usersWithPermsCount}/${after.users}`);

  console.log(`\n${ok ? "✓ CLEAN" : "✗ FAILED"}`);
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
