import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const [sites, plots, jobs, orders, suppliers, contacts, users, plotTemplates, templateJobs, templateOrders, templateOrderItems, perms, userSites, events, snags, snagPhotos, rainedOff, documents, jobActions, jobPhotos, orderItems, handover, jobContractors, notifSubs, notifPrefs, supplierMaterials] = await Promise.all([
    prisma.site.count(),
    prisma.plot.count(),
    prisma.job.count(),
    prisma.materialOrder.count(),
    prisma.supplier.count(),
    prisma.contact.count(),
    prisma.user.count(),
    prisma.plotTemplate.count(),
    prisma.templateJob.count(),
    prisma.templateOrder.count(),
    prisma.templateOrderItem.count(),
    prisma.userPermission.count(),
    prisma.userSite.count(),
    prisma.eventLog.count(),
    prisma.snag.count(),
    prisma.snagPhoto.count(),
    prisma.rainedOffDay.count(),
    prisma.siteDocument.count(),
    prisma.jobAction.count(),
    prisma.jobPhoto.count(),
    prisma.orderItem.count(),
    prisma.handoverChecklist.count(),
    prisma.jobContractor.count(),
    prisma.pushSubscription.count(),
    prisma.notificationPreference.count(),
    prisma.supplierMaterial.count(),
  ]);

  console.log("=== Current DB state ===");
  console.log(`Sites:                ${sites}`);
  console.log(`  Plots:              ${plots}`);
  console.log(`  Jobs:               ${jobs}`);
  console.log(`  Material Orders:    ${orders}`);
  console.log(`  Order Items:        ${orderItems}`);
  console.log(`  Job Actions:        ${jobActions}`);
  console.log(`  Job Photos:         ${jobPhotos}`);
  console.log(`  Event Logs:         ${events}`);
  console.log(`  Snags:              ${snags}`);
  console.log(`  Snag Photos:        ${snagPhotos}`);
  console.log(`  Rained-off days:    ${rainedOff}`);
  console.log(`  Site Documents:     ${documents}`);
  console.log(`  Handover checklist: ${handover}`);
  console.log(`  UserSite (access):  ${userSites}`);
  console.log(`  JobContractor:      ${jobContractors}`);
  console.log("--- Reference data (to preserve) ---");
  console.log(`Users:                ${users}`);
  console.log(`Suppliers:            ${suppliers}`);
  console.log(`  SupplierMaterials:  ${supplierMaterials}`);
  console.log(`Contacts:             ${contacts}`);
  console.log(`UserPermission:       ${perms}`);
  console.log(`Push Subs:            ${notifSubs}`);
  console.log(`Notif Prefs:          ${notifPrefs}`);
  console.log(`PlotTemplate:         ${plotTemplates}`);
  console.log(`TemplateJob:          ${templateJobs}`);
  console.log(`TemplateOrder:        ${templateOrders}`);
  console.log(`TemplateOrderItem:    ${templateOrderItems}`);

  console.log("\n=== Sites (will be deleted) ===");
  const siteList = await prisma.site.findMany({
    select: { id: true, name: true, createdAt: true, _count: { select: { plots: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const s of siteList) {
    console.log(`  - ${s.name} (${s._count.plots} plots) id=${s.id}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
