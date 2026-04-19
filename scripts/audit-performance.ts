/**
 * Performance audit — times the actual Prisma queries each key endpoint
 * runs, against the real production DB. Anything over 500ms is flagged
 * for fix.
 *
 * Runs via: npx tsx scripts/audit-performance.ts
 *
 * Mirrors the queries in the API route handlers rather than hitting HTTP,
 * so we measure DB time precisely (excludes Next.js overhead, which is
 * fixed and small). Each query runs 3 times — reported is the median.
 *
 * DOES NOT MUTATE. Read-only.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Result {
  label: string;
  median: number;
  max: number;
  rows: number;
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<Result> {
  const times: number[] = [];
  let rows = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const out = await fn();
    const t1 = performance.now();
    times.push(t1 - t0);
    if (Array.isArray(out)) rows = out.length;
  }
  times.sort((a, b) => a - b);
  return {
    label,
    median: Math.round(times[1]),
    max: Math.round(times[2]),
    rows,
  };
}

async function main() {
  console.log("\n=== Performance audit (DB-level) ===\n");
  console.log("Threshold: 500ms median. Anything above is flagged.\n");

  // Pick the test site with the most data so results represent real load.
  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    include: { _count: { select: { plots: true } } },
    orderBy: { createdAt: "desc" },
  });
  const site = sites.sort((a, b) => b._count.plots - a._count.plots)[0];
  if (!site) {
    console.log("No active site found — run a seed first.");
    return;
  }
  console.log(`Site under test: ${site.name} (${site._count.plots} plots)\n`);
  const siteId = site.id;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);

  const results: Result[] = [];

  // ── /api/sites/[id]/programme ─────────────────────────────────────
  results.push(await time("Programme: plots + jobs + orders", () =>
    prisma.plot.findMany({
      where: { siteId },
      include: {
        jobs: {
          include: {
            orders: { include: { supplier: true, orderItems: true } },
            contractors: { include: { contact: true } },
          },
        },
      },
      orderBy: [{ plotNumber: "asc" }, { name: "asc" }],
    })
  ));

  // ── /api/sites/[id]/daily-brief — the heavy aggregates ────────────
  results.push(await time("Daily Brief: overdue jobs", () =>
    prisma.job.findMany({
      where: { plot: { siteId }, status: "NOT_STARTED", startDate: { lt: today, not: null } },
      include: { plot: true, orders: true },
    })
  ));
  results.push(await time("Daily Brief: deliveries today", () =>
    prisma.materialOrder.findMany({
      where: { job: { plot: { siteId } }, status: "ORDERED", expectedDeliveryDate: { gte: today, lte: todayEnd } },
      include: { supplier: true, job: { include: { plot: true } } },
    })
  ));
  results.push(await time("Daily Brief: upcoming deliveries (14 days)", () =>
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId } },
        status: { in: ["PENDING", "ORDERED"] },
      },
      include: { supplier: true, job: { include: { plot: true } }, orderItems: true },
    })
  ));

  // ── /api/analytics ────────────────────────────────────────────────
  results.push(await time("Analytics: all jobs", () =>
    prisma.job.findMany({
      where: { plot: { siteId } },
      include: { plot: true, orders: true, actions: true, contractors: { include: { contact: true } } },
    })
  ));

  // ── /api/sites/[id]/contractor-comms ──────────────────────────────
  results.push(await time("Contractor Comms: job-contractors", () =>
    prisma.jobContractor.findMany({
      where: { job: { plot: { siteId }, children: { none: {} } } },
      select: {
        contactId: true,
        contact: { select: { id: true, name: true, company: true, email: true, phone: true } },
        job: {
          select: {
            id: true, name: true, status: true, startDate: true, endDate: true, sortOrder: true,
            plot: { select: { id: true, plotNumber: true, name: true } },
          },
        },
      },
    })
  ));

  // ── /api/sites/[id]/critical-path ─────────────────────────────────
  results.push(await time("Critical Path: plots + jobs with rollup", () =>
    prisma.plot.findMany({
      where: { siteId },
      include: {
        jobs: {
          include: { contractors: { include: { contact: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    })
  ));

  // ── /api/sites/[id]/weekly-report ─────────────────────────────────
  results.push(await time("Weekly Report: all jobs", () =>
    prisma.job.findMany({
      where: { plot: { siteId } },
      include: { plot: true, actions: { orderBy: { createdAt: "desc" } } },
    })
  ));

  // ── /api/sites/[id]/budget-report ─────────────────────────────────
  results.push(await time("Budget Report: plots + jobs + orders", () =>
    prisma.plot.findMany({
      where: { siteId },
      include: {
        jobs: { include: { orders: { include: { orderItems: true } } } },
      },
    })
  ));

  // ── /api/sites/[id]/orders ────────────────────────────────────────
  results.push(await time("Site Orders: material orders", () =>
    prisma.materialOrder.findMany({
      where: { job: { plot: { siteId } } },
      include: {
        supplier: true,
        orderItems: true,
        job: { include: { plot: true } },
      },
      orderBy: { dateOfOrder: "desc" },
    })
  ));

  // ── /api/tasks — global across all sites ──────────────────────────
  results.push(await time("Tasks: pending/overdue across all sites", () =>
    prisma.materialOrder.findMany({
      where: { status: "PENDING" },
      include: { supplier: true, job: { include: { plot: { include: { site: true } } } }, orderItems: true },
    })
  ));

  // ── /api/sites — list ─────────────────────────────────────────────
  results.push(await time("Sites: list all sites + counts", () =>
    prisma.site.findMany({
      include: { _count: { select: { plots: true } } },
    })
  ));

  // ── Report ────────────────────────────────────────────────────────
  console.log(
    "| " + "Query".padEnd(52) +
    " | " + "Median".padStart(6) +
    " | " + "Max".padStart(5) +
    " | " + "Rows".padStart(5) +
    " | Flag |"
  );
  console.log("|" + "-".repeat(54) + "|" + "-".repeat(8) + "|" + "-".repeat(7) + "|" + "-".repeat(7) + "|" + "-".repeat(6) + "|");

  const slow: Result[] = [];
  for (const r of results) {
    const flag = r.median > 500 ? "🚩" : r.median > 200 ? "⚠️ " : "  ";
    if (r.median > 500) slow.push(r);
    console.log(
      "| " + r.label.padEnd(52) +
      " | " + `${r.median}ms`.padStart(6) +
      " | " + `${r.max}ms`.padStart(5) +
      " | " + String(r.rows).padStart(5) +
      " | " + flag + " |"
    );
  }

  console.log(`\n=== Summary ===`);
  if (slow.length === 0) {
    console.log(`✅  All ${results.length} queries under 500ms median.`);
  } else {
    console.log(`🚩  ${slow.length} of ${results.length} queries are SLOW (median > 500ms):`);
    for (const r of slow) {
      console.log(`   - ${r.label}: median ${r.median}ms (${r.rows} rows)`);
    }
  }
  const warn = results.filter((r) => r.median > 200 && r.median <= 500);
  if (warn.length > 0) {
    console.log(`⚠️   ${warn.length} in the 200-500ms range (watch):`);
    for (const r of warn) {
      console.log(`   - ${r.label}: median ${r.median}ms`);
    }
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
