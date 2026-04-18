/**
 * Full end-to-end pipeline test.
 *
 * Seeds: uses an existing PlotTemplate ("The Willow").
 *
 * Flow:
 *  1. Create a new site
 *  2. Apply The Willow template to create a plot with ~19 child jobs + 17 orders
 *  3. Verify parent Jobs created (the 9 parent stages exist as real rows)
 *  4. Walk the plot through the first parent stage:
 *     - Start first child
 *     - Mark its orders delivered
 *     - Complete first child
 *     - Sign off
 *     - Verify parent auto-IN_PROGRESS, buildCompletePercent updates
 *  5. Hit every view endpoint with this site to ensure none throw:
 *     daily-brief, delay-report, budget-report, cash-flow, weekly-report,
 *     calendar, walkthrough, contractor-comms, day-sheets, orders,
 *     log, snags, delay
 *  6. Clean up
 *
 * Run: npx tsx scripts/test-e2e-template.ts
 */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";
// Can be set via CLI: npx tsx scripts/test-e2e-template.ts "The Oakwood"
const TEMPLATE_NAME = process.argv[2] || "The Willow";

const prisma = new PrismaClient();
const jar: Record<string, string> = {};
const results: Array<{ name: string; ok: boolean; note?: string }> = [];

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
    headers: {
      ...(init.headers || {}),
      Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  mergeSetCookies(res);
  return res;
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken, callbackUrl: BASE, json: "true" }).toString();
  const cbRes = await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (cbRes.status >= 400) throw new Error(`Login failed: ${cbRes.status}`);
  const sess = await req("/api/auth/session");
  const sjson = await sess.json();
  return sjson.user.id as string;
}

function record(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${note ? " — " + note : ""}`);
}

async function main() {
  console.log("\nLogging in…");
  const userId = await login();
  console.log(`  ✓ uid=${userId}\n`);

  const template = await prisma.plotTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
    include: {
      jobs: { where: { parentId: null }, include: { children: { select: { id: true } } } },
    },
  });
  if (!template) throw new Error(`Template "${TEMPLATE_NAME}" not found in DB`);
  const expectedParents = template.jobs.filter((j) => j.children.length > 0).length;
  const expectedChildren = template.jobs.reduce((n, j) => n + j.children.length, 0);
  const expectedFlatTopLevel = template.jobs.filter((j) => j.children.length === 0).length;
  const expectedTotal = expectedParents + expectedChildren + expectedFlatTopLevel;

  console.log(`Using template: ${template.name}\n`);

  // 1. Create site via API
  console.log("1. Create site via API…");
  const siteRes = await req("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `__E2E_TEST_${Date.now()}__`, location: "Test Town", postcode: "SW1A 1AA" }),
  });
  const site = await siteRes.json();
  record("Site created via API", siteRes.ok && !!site.id, `id=${site.id}`);

  // 2. Apply template
  console.log("\n2. Apply template to plot 1…");
  const applyRes = await req("/api/plots/apply-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: site.id,
      plotName: "Test Plot 1",
      plotNumber: "1",
      templateId: template.id,
      startDate: new Date().toISOString().split("T")[0],
    }),
  });
  const plot = await applyRes.json();
  record("Template applied", applyRes.ok && !!plot.id, `plot.id=${plot.id}, jobs=${plot.jobs?.length}`);

  // 3. Verify parent Jobs created
  const allJobs = await prisma.job.findMany({
    where: { plotId: plot.id },
    orderBy: { sortOrder: "asc" },
    include: { children: { select: { id: true } }, orders: { select: { id: true, status: true } } },
  });
  const parents = allJobs.filter((j) => j.children.length > 0);
  const leaves = allJobs.filter((j) => j.children.length === 0);
  record(
    `Parent Jobs created (expected ${expectedParents} from ${template.name})`,
    parents.length === expectedParents,
    `parents=${parents.length}, leaves=${leaves.length}, total=${allJobs.length}`
  );
  record(
    `Total jobs matches template`,
    allJobs.length === expectedTotal,
    `expected=${expectedTotal}, actual=${allJobs.length}`
  );

  // 4. Parent dates span children
  for (const p of parents.slice(0, 3)) {
    const childJobs = await prisma.job.findMany({
      where: { parentId: p.id },
      select: { startDate: true, endDate: true },
    });
    const minStart = Math.min(...childJobs.map((c) => c.startDate!.getTime()));
    const maxEnd = Math.max(...childJobs.map((c) => c.endDate!.getTime()));
    const spansOK =
      !!p.startDate && !!p.endDate &&
      p.startDate.getTime() === minStart && p.endDate.getTime() === maxEnd;
    record(
      `Parent "${p.name}" dates span its ${childJobs.length} children`,
      spansOK,
      `parent=${p.startDate?.toISOString().slice(0,10)}→${p.endDate?.toISOString().slice(0,10)}, children=${new Date(minStart).toISOString().slice(0,10)}→${new Date(maxEnd).toISOString().slice(0,10)}`
    );
  }

  // 5. All orders attached to real jobs, working-day dateOfOrder
  const orders = await prisma.materialOrder.findMany({
    where: { job: { plotId: plot.id } },
    select: { id: true, status: true, dateOfOrder: true, expectedDeliveryDate: true, jobId: true },
  });
  const onWeekend = orders.filter((o) => {
    const d = o.dateOfOrder.getDay();
    return d === 0 || d === 6;
  });
  record(
    "All orders have working-day dateOfOrder (no weekends)",
    onWeekend.length === 0,
    `total=${orders.length}, weekend=${onWeekend.length}`
  );
  const deliveriesOnWeekend = orders.filter((o) => {
    if (!o.expectedDeliveryDate) return false;
    const d = o.expectedDeliveryDate.getDay();
    return d === 0 || d === 6;
  });
  record(
    "All orders have working-day expectedDeliveryDate (no weekends)",
    deliveriesOnWeekend.length === 0,
    `weekend deliveries=${deliveriesOnWeekend.length}/${orders.length}`
  );

  // 6. Walk first parent stage through the full lifecycle
  console.log("\n3. Walk first parent stage through full lifecycle…");
  const firstParent = parents[0];
  const firstChildren = allJobs.filter((j) => j.parentId === firstParent.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const firstChild = firstChildren[0];
  console.log(`   Parent: "${firstParent.name}", first child: "${firstChild.name}"`);

  // Start first child
  const startRes = await req(`/api/jobs/${firstChild.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", skipOrderProgression: true }),
  });
  const firstChildAfterStart = await prisma.job.findUnique({ where: { id: firstChild.id } });
  record("Start first child returns OK", startRes.ok, `HTTP=${startRes.status}`);
  record("First child is IN_PROGRESS", firstChildAfterStart?.status === "IN_PROGRESS", `status=${firstChildAfterStart?.status}`);

  const parentAfterStart = await prisma.job.findUnique({ where: { id: firstParent.id } });
  record("Parent auto-promotes to IN_PROGRESS", parentAfterStart?.status === "IN_PROGRESS", `parent.status=${parentAfterStart?.status}`);

  // Deliver any ORDERED orders on this job
  const orderedOnChild = await prisma.materialOrder.findMany({
    where: { jobId: firstChild.id, status: { in: ["PENDING", "ORDERED"] } },
  });
  for (const o of orderedOnChild) {
    if (o.status === "PENDING") {
      await req(`/api/orders/${o.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ORDERED" }),
      });
    }
    await req(`/api/orders/${o.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DELIVERED" }),
    });
  }
  const deliveredCount = await prisma.materialOrder.count({
    where: { jobId: firstChild.id, status: "DELIVERED" },
  });
  record(
    "Orders on first child progressed to DELIVERED via single-order endpoint",
    deliveredCount === orderedOnChild.length,
    `delivered=${deliveredCount}, expected=${orderedOnChild.length}`
  );

  // Complete first child
  const completeRes = await req(`/api/jobs/${firstChild.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete" }),
  });
  const afterComplete = await prisma.job.findUnique({ where: { id: firstChild.id } });
  record("Complete returns OK", completeRes.ok, `HTTP=${completeRes.status}`);
  record("Child is COMPLETED + actualEndDate set", afterComplete?.status === "COMPLETED" && !!afterComplete?.actualEndDate, `status=${afterComplete?.status}`);

  // Sign off
  const signoffRes = await req(`/api/jobs/${firstChild.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "signoff" }),
  });
  const afterSignoff = await prisma.job.findUnique({ where: { id: firstChild.id } });
  record("Signoff returns OK + signedOffAt set", signoffRes.ok && !!afterSignoff?.signedOffAt, `signedOffAt=${!!afterSignoff?.signedOffAt}`);

  // Complete the remaining children of the first parent so parent auto-COMPLETES
  for (const c of firstChildren.slice(1)) {
    // Short-circuit: set to IN_PROGRESS directly (skip pre-start UX) then complete
    await prisma.job.update({ where: { id: c.id }, data: { status: "IN_PROGRESS", actualStartDate: new Date() } });
    await req(`/api/jobs/${c.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
  }
  const parentAfterAllDone = await prisma.job.findUnique({ where: { id: firstParent.id } });
  record(
    "Parent auto-COMPLETED when all children done",
    parentAfterAllDone?.status === "COMPLETED",
    `parent.status=${parentAfterAllDone?.status}`
  );

  const plotAfter = await prisma.plot.findUnique({ where: { id: plot.id } });
  const expectedPct = Math.round((firstChildren.length / leaves.length) * 100);
  record(
    `Plot buildCompletePercent reflects leaves (expected ~${expectedPct}%)`,
    plotAfter?.buildCompletePercent === expectedPct,
    `pct=${plotAfter?.buildCompletePercent}`
  );

  // 7. Hit EVERY consuming view endpoint for this site — they must all return 200 and have valid shapes
  console.log("\n4. Sanity-check every consuming view endpoint…");
  const viewEndpoints = [
    { path: `/api/sites/${site.id}/daily-brief`, name: "Daily Brief" },
    { path: `/api/sites/${site.id}/delay-report`, name: "Delay Report" },
    { path: `/api/sites/${site.id}/budget-report`, name: "Budget Report" },
    { path: `/api/sites/${site.id}/cash-flow`, name: "Cash Flow" },
    { path: `/api/sites/${site.id}/weekly-report`, name: "Weekly Report" },
    { path: `/api/sites/${site.id}/calendar`, name: "Site Calendar" },
    { path: `/api/sites/${site.id}/walkthrough`, name: "Walkthrough" },
    { path: `/api/sites/${site.id}/contractor-comms`, name: "Contractor Comms" },
    { path: `/api/sites/${site.id}/day-sheets`, name: "Day Sheets" },
    { path: `/api/sites/${site.id}/orders`, name: "Site Orders" },
    { path: `/api/sites/${site.id}/log`, name: "Site Log" },
    { path: `/api/sites/${site.id}/snags`, name: "Site Snags" },
    { path: `/api/sites/${site.id}`, name: "Site detail" },
    { path: `/api/analytics?siteId=${site.id}`, name: "Analytics" },
    { path: `/api/plots/${plot.id}/jobs`, name: "Plot Jobs" },
    { path: `/api/plots/${plot.id}/snags`, name: "Plot Snags" },
  ];
  for (const ep of viewEndpoints) {
    const r = await req(ep.path);
    let bodyShape = "?";
    try {
      const b = await r.json();
      if (Array.isArray(b)) bodyShape = `array[${b.length}]`;
      else if (typeof b === "object" && b !== null) bodyShape = `obj{${Object.keys(b).slice(0, 5).join(",")}...}`;
    } catch {
      bodyShape = "non-json";
    }
    record(`View ${ep.name}: HTTP 200`, r.status === 200, `status=${r.status}, shape=${bodyShape}`);
  }

  // 8. Cleanup
  console.log("\n5. Cleanup…");
  // Delete via Prisma cascade (site → plot → jobs → orders)
  await prisma.site.delete({ where: { id: site.id } });
  console.log("  ✓ test site deleted");

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n===== ${passed}/${total} passed =====`);
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  FAIL: ${r.name}${r.note ? " — " + r.note : ""}`);
  }
  await prisma.$disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
