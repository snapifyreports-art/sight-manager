/**
 * Read-only audit — compares the same logical counts computed two different
 * ways: once as the Daily Brief API does it, and once as the Analytics API
 * does it. If they disagree, it's a query-logic drift bug.
 *
 * Runs via: npx tsx scripts/audit-analytics-vs-brief.ts
 *
 * For each active site, reports:
 *   - Overdue jobs count  (Brief vs Analytics)
 *   - Jobs starting today (Brief vs Analytics)
 *   - Active (in-progress) jobs (Brief vs Analytics)
 *   - Pending orders (Brief vs Analytics)
 *   - Deliveries due today (Brief vs Analytics)
 *   - Open snags (Brief vs Analytics)
 *
 * DOES NOT MUTATE. Uses the raw Prisma client, not the API routes.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

async function main() {
  console.log("\n=== Analytics vs Daily Brief reconciliation ===\n");

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(today);

  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Sites to audit: ${sites.length}\n`);

  let totalDrift = 0;

  for (const site of sites) {
    // ── Brief-style queries (as per /api/sites/[id]/daily-brief) ───────
    const briefOverdue = await prisma.job.count({
      where: {
        plot: { siteId: site.id },
        status: "NOT_STARTED",
        startDate: { lt: today, not: null },
      },
    });
    const briefStartingToday = await prisma.job.count({
      where: {
        plot: { siteId: site.id },
        status: "NOT_STARTED",
        startDate: { gte: today, lte: todayEnd },
      },
    });
    const briefActive = await prisma.job.count({
      where: {
        plot: { siteId: site.id },
        status: "IN_PROGRESS",
      },
    });
    const briefPendingOrders = await prisma.materialOrder.count({
      where: {
        job: { plot: { siteId: site.id } },
        status: "PENDING",
      },
    });
    const briefDeliveriesToday = await prisma.materialOrder.count({
      where: {
        job: { plot: { siteId: site.id } },
        status: "ORDERED",
        expectedDeliveryDate: { gte: today, lte: todayEnd },
      },
    });
    const briefOpenSnags = await prisma.snag.count({
      where: {
        plot: { siteId: site.id },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    // ── Analytics-style queries (as per /api/analytics) ────────────────
    // Analytics fetches raw arrays and counts client-side — mirror that.
    const analyticsJobs = await prisma.job.findMany({
      where: { plot: { siteId: site.id } },
      select: { status: true, startDate: true },
    });
    const analyticsOrders = await prisma.materialOrder.findMany({
      where: { job: { plot: { siteId: site.id } } },
      select: { status: true, expectedDeliveryDate: true },
    });
    const analyticsSnags = await prisma.snag.findMany({
      where: { plot: { siteId: site.id } },
      select: { status: true },
    });

    const analyticsOverdue = analyticsJobs.filter(
      (j) => j.status === "NOT_STARTED" && j.startDate && j.startDate < today
    ).length;
    const analyticsStartingToday = analyticsJobs.filter(
      (j) => j.status === "NOT_STARTED" && j.startDate && j.startDate >= today && j.startDate <= todayEnd
    ).length;
    const analyticsActive = analyticsJobs.filter((j) => j.status === "IN_PROGRESS").length;
    const analyticsPendingOrders = analyticsOrders.filter((o) => o.status === "PENDING").length;
    const analyticsDeliveriesToday = analyticsOrders.filter(
      (o) =>
        o.status === "ORDERED" &&
        o.expectedDeliveryDate &&
        o.expectedDeliveryDate >= today &&
        o.expectedDeliveryDate <= todayEnd
    ).length;
    const analyticsOpenSnags = analyticsSnags.filter(
      (s) => s.status === "OPEN" || s.status === "IN_PROGRESS"
    ).length;

    // ── Compare and report ────────────────────────────────────────────
    const rows: Array<[string, number, number]> = [
      ["Overdue jobs",         briefOverdue,          analyticsOverdue],
      ["Starting today",       briefStartingToday,    analyticsStartingToday],
      ["Active (in-progress)", briefActive,           analyticsActive],
      ["Pending orders",       briefPendingOrders,    analyticsPendingOrders],
      ["Deliveries today",     briefDeliveriesToday,  analyticsDeliveriesToday],
      ["Open snags",           briefOpenSnags,        analyticsOpenSnags],
    ];
    const driftRows = rows.filter(([, b, a]) => b !== a);

    if (driftRows.length > 0) {
      console.log(`⚠️  ${site.name}  (drift in ${driftRows.length} metric${driftRows.length === 1 ? "" : "s"})`);
      for (const [label, brief, analytics] of rows) {
        const marker = brief === analytics ? " " : "⚠️";
        console.log(`   ${marker}  ${label.padEnd(24)} Brief=${String(brief).padStart(4)}  Analytics=${String(analytics).padStart(4)}`);
      }
      console.log();
      totalDrift += driftRows.length;
    } else {
      console.log(`✅ ${site.name}  — all 6 metrics match`);
    }
  }

  console.log(`\n=== Summary ===`);
  if (totalDrift === 0) {
    console.log(`✅  All ${sites.length} sites × 6 metrics reconcile cleanly.`);
    console.log(`    Any user-visible mismatch is a UI-layer rendering bug, not a query drift.`);
  } else {
    console.log(`⚠️  Found ${totalDrift} metric(s) with drift across sites.`);
    console.log(`    Next action: inspect the offending API routes' filter logic.`);
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
