/**
 * Cross-view data consistency test.
 * Same number must match across views. Example: Budget.committed for a plot must
 * equal the sum of ORDERED + DELIVERED orders on that plot; Cash Flow totals must
 * align; Daily Brief counts must reflect the actual DB state.
 *
 * Run: npx tsx scripts/test-consistency.ts
 */
import { PrismaClient } from "@prisma/client";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";

const prisma = new PrismaClient();
const jar: Record<string, string> = {};

function mergeSetCookies(res: Response) {
  const raw = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const line of raw) {
    const [kv] = line.split(";");
    const eq = kv.indexOf("=");
    if (eq > 0) {
      const name = kv.slice(0, eq).trim();
      const value = kv.slice(eq + 1).trim();
      if (value === "" || value === "deleted") delete jar[name];
      else jar[name] = value;
    }
  }
}

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers || {}), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  mergeSetCookies(res);
  return res;
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken, callbackUrl: BASE, json: "true" }).toString(),
  });
  return (await (await req("/api/auth/session")).json()).user.id as string;
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("Consistency test\n");
  const userId = await login();

  // Clean
  const old = await prisma.site.findFirst({ where: { name: "__CONSISTENCY__" } });
  if (old) await prisma.site.delete({ where: { id: old.id } });

  // Seed 2 plots from Willow
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
  if (!template) throw new Error("Willow missing");

  const site = await prisma.site.create({
    data: { name: "__CONSISTENCY__", location: "Leeds", postcode: "LS1 1AA", createdById: userId, assignedToId: userId, userAccess: { create: [{ userId }] } },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const n of ["1", "2"]) {
    await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.create({ data: { siteId: site.id, plotNumber: n, name: `Plot ${n}`, houseType: template.typeLabel } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createJobsFromTemplate(tx, plot.id, today, template.jobs as any, null, userId);
    }, { timeout: 60_000 });
  }
  console.log("  ✓ 2 plots seeded");

  // ── Test 1: Budget.committed (plot) === sum of ORDERED+DELIVERED orders on that plot
  console.log("\n1. Budget per-plot committed = ORDERED+DELIVERED from DB");
  const budgetRes = await req(`/api/sites/${site.id}/budget-report`);
  const budget = await budgetRes.json();
  for (const p of budget.plots) {
    const ordersForPlot = await prisma.materialOrder.findMany({
      where: { job: { plotId: p.plotId }, status: { in: ["ORDERED", "DELIVERED"] } },
      include: { orderItems: true },
    });
    const dbSum = Math.round(ordersForPlot.reduce((s, o) => s + o.orderItems.reduce((si, i) => si + i.totalCost, 0), 0) * 100) / 100;
    assert(
      `   Plot ${p.plotNumber} committed matches DB`,
      Math.abs(p.committed - dbSum) < 0.01,
      `report=${p.committed}, db=${dbSum}`
    );
  }

  // ── Test 2: Cash Flow totals.committed === Budget siteSummary.totalCommitted
  console.log("\n2. Cash Flow totals.committed === Budget siteSummary.totalCommitted");
  const cashRes = await req(`/api/sites/${site.id}/cash-flow`);
  const cash = await cashRes.json();
  assert(
    "   Values match",
    Math.abs(cash.totals.committed - budget.siteSummary.totalCommitted) < 0.01,
    `cash=${cash.totals.committed}, budget=${budget.siteSummary.totalCommitted}`
  );

  // ── Test 3: Daily Brief jobsStartingToday count === DB leaf count
  console.log("\n3. Daily Brief 'jobsStartingToday' count matches DB (leaves only)");
  // Force one child to have startDate=today
  const pickChild = await prisma.job.findFirst({
    where: { plot: { siteId: site.id }, parentId: { not: null } },
  });
  if (pickChild) {
    await prisma.job.update({
      where: { id: pickChild.id },
      data: { startDate: new Date(), endDate: new Date(Date.now() + 3 * 86400000), status: "NOT_STARTED" },
    });
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
    const dbCount = await prisma.job.count({
      where: {
        plot: { siteId: site.id },
        startDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        children: { none: {} },
      },
    });
    const briefRes = await req(`/api/sites/${site.id}/daily-brief`);
    const brief = await briefRes.json();
    const apiCount = (brief.jobsStartingToday || []).length;
    assert("   Counts match", apiCount === dbCount, `api=${apiCount}, db=${dbCount}`);
  }

  // ── Test 4: Walkthrough totalJobs (per plot) === leaf count
  console.log("\n4. Walkthrough totalJobs (per plot) === DB leaf count for that plot");
  const wtRes = await req(`/api/sites/${site.id}/walkthrough`);
  const wt = await wtRes.json();
  for (const wp of wt.plots.slice(0, 2)) {
    const dbLeafCount = await prisma.job.count({
      where: { plot: { id: wp.id }, children: { none: {} } },
    });
    assert(
      `   Plot ${wp.plotNumber} totalJobs matches DB leaf count`,
      wp.totalJobs === dbLeafCount,
      `api=${wp.totalJobs}, db=${dbLeafCount}`
    );
  }

  // ── Test 5: buildCompletePercent === completed leaves / total leaves
  console.log("\n5. plot.buildCompletePercent === completed leaves / total leaves");
  // Pick one plot, complete all leaves under its first parent stage
  const plot1 = await prisma.plot.findFirst({ where: { siteId: site.id, plotNumber: "1" } });
  const firstParent = await prisma.job.findFirst({ where: { plotId: plot1!.id, parentId: null, children: { some: {} } }, orderBy: { sortOrder: "asc" } });
  if (firstParent) {
    const children = await prisma.job.findMany({ where: { parentId: firstParent.id } });
    // Use the real API path — seed children as IN_PROGRESS then complete them via actions
    for (const c of children) {
      await prisma.job.update({
        where: { id: c.id },
        data: { status: "IN_PROGRESS", actualStartDate: today },
      });
      await req(`/api/jobs/${c.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    }
    const freshPlot = await prisma.plot.findUnique({ where: { id: plot1!.id } });
    const totalLeaves = await prisma.job.count({ where: { plotId: plot1!.id, children: { none: {} } } });
    const completedLeaves = await prisma.job.count({ where: { plotId: plot1!.id, children: { none: {} }, status: "COMPLETED" } });
    const expectedPct = totalLeaves > 0 ? Math.round((completedLeaves / totalLeaves) * 100) : 0;
    assert(
      `   buildCompletePercent reflects leaves (expected ${expectedPct}%)`,
      freshPlot?.buildCompletePercent === expectedPct,
      `pct=${freshPlot?.buildCompletePercent}, expected=${expectedPct}`
    );
  }

  // ── Test 6: Weekly Report overview.totalJobs === leaf count for site
  console.log("\n6. Weekly Report overview.totalJobs === leaf count for site");
  const wkRes = await req(`/api/sites/${site.id}/weekly-report`);
  const wk = await wkRes.json();
  const siteLeafCount = await prisma.job.count({ where: { plot: { siteId: site.id }, children: { none: {} } } });
  assert(
    "   Counts match",
    wk.overview.totalJobs === siteLeafCount,
    `api=${wk.overview.totalJobs}, db=${siteLeafCount}`
  );

  // Cleanup
  console.log("\nCleaning up…");
  await prisma.site.delete({ where: { id: site.id } });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  if (passed < results.length) {
    for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL: ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
