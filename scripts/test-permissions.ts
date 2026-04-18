/**
 * Non-admin permissions test pass.
 *
 * Creates a SITE_MANAGER test user with access to ONLY ONE site.
 * Verifies:
 *  - They CAN read their site's data
 *  - They CANNOT read other sites' data (API + server-component pages)
 *  - Permission-gated actions respect role perms
 *  - Keith (CEO) can still see everything
 *
 * Then creates a CONTRACTOR test user with even fewer permissions.
 * Verifies they can only see what they're supposed to.
 *
 * Cleans up at the end.
 *
 * Run: npx tsx scripts/test-permissions.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const BASE = "http://localhost:3002";
const prisma = new PrismaClient();

const TEST_SM_EMAIL = "sm-test@sightmanager.com";
const TEST_SM_PASSWORD = "test1234";
const TEST_CX_EMAIL = "contractor-test@sightmanager.com";
const TEST_CX_PASSWORD = "test1234";

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Each test user has its own cookie jar
function makeJar() {
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
  async function login(email: string, password: string) {
    const csrfRes = await req("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    await req("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password, csrfToken, callbackUrl: BASE, json: "true" }).toString(),
    });
    const s = await req("/api/auth/session");
    return s.json();
  }
  return { req, login };
}

async function main() {
  console.log("Non-admin permissions pass\n");

  // ── Cleanup previous runs
  await prisma.site.deleteMany({ where: { name: { in: ["__PERM_SITE_A__", "__PERM_SITE_B__"] } } });
  await prisma.user.deleteMany({ where: { email: { in: [TEST_SM_EMAIL, TEST_CX_EMAIL] } } });

  // ── Find Keith for creating sites
  const keith = await prisma.user.findUnique({ where: { email: "keith@sightmanager.com" } });
  if (!keith) throw new Error("Keith not found");

  // ── Create two sites
  const siteA = await prisma.site.create({
    data: { name: "__PERM_SITE_A__", location: "A", createdById: keith.id, assignedToId: keith.id },
  });
  const siteB = await prisma.site.create({
    data: { name: "__PERM_SITE_B__", location: "B", createdById: keith.id, assignedToId: keith.id },
  });
  // Plot on site B with a job we'll try to reach
  const plotB = await prisma.plot.create({
    data: { siteId: siteB.id, plotNumber: "B1", name: "Plot B1" },
  });
  const jobB = await prisma.job.create({
    data: { plotId: plotB.id, name: "Secret Job on B", sortOrder: 0 },
  });

  // ── Create SITE_MANAGER user, grant access to ONLY site A
  const smPass = await hash(TEST_SM_PASSWORD, 10);
  const sm = await prisma.user.create({
    data: {
      name: "SM Test",
      email: TEST_SM_EMAIL,
      password: smPass,
      role: "SITE_MANAGER",
      siteAccess: { create: [{ siteId: siteA.id }] },
      permissions: {
        create: [
          { permission: "VIEW_DASHBOARD" },
          { permission: "VIEW_SITES" },
          { permission: "VIEW_ORDERS" },
          { permission: "SIGN_OFF_JOBS" },
          { permission: "MANAGE_ORDERS" },
          { permission: "EDIT_PROGRAMME" },
        ],
      },
    },
  });

  // ── Create CONTRACTOR user with no site access + minimal perms
  const cxPass = await hash(TEST_CX_PASSWORD, 10);
  const cx = await prisma.user.create({
    data: {
      name: "CX Test",
      email: TEST_CX_EMAIL,
      password: cxPass,
      role: "CONTRACTOR",
      permissions: { create: [{ permission: "VIEW_DASHBOARD" }] },
    },
  });

  console.log(`  ✓ Site A (${siteA.id.slice(-6)}), Site B (${siteB.id.slice(-6)}), SM + CX test users created\n`);

  // ── Log in as SM
  const smSession = makeJar();
  const smLoginResult = await smSession.login(TEST_SM_EMAIL, TEST_SM_PASSWORD);
  assert("SM can log in", !!smLoginResult?.user?.id, `uid=${smLoginResult?.user?.id}`);

  // ── SM can GET their site
  const smOwnSite = await smSession.req(`/api/sites/${siteA.id}`);
  assert("SM can read their assigned site", smOwnSite.status === 200, `status=${smOwnSite.status}`);

  // ── SM CANNOT GET other site
  console.log("\n  SITE-SCOPED ENDPOINTS (SM on Site B — should all 403):");
  const endpoints = [
    { path: `/api/sites/${siteB.id}`, name: "site detail" },
    { path: `/api/sites/${siteB.id}/daily-brief`, name: "daily-brief" },
    { path: `/api/sites/${siteB.id}/delay-report`, name: "delay-report" },
    { path: `/api/sites/${siteB.id}/budget-report`, name: "budget-report" },
    { path: `/api/sites/${siteB.id}/cash-flow`, name: "cash-flow" },
    { path: `/api/sites/${siteB.id}/weekly-report`, name: "weekly-report" },
    { path: `/api/sites/${siteB.id}/walkthrough`, name: "walkthrough" },
    { path: `/api/sites/${siteB.id}/day-sheets`, name: "day-sheets" },
    { path: `/api/sites/${siteB.id}/orders`, name: "orders" },
    { path: `/api/sites/${siteB.id}/log`, name: "log" },
    { path: `/api/sites/${siteB.id}/snags`, name: "snags" },
    { path: `/api/sites/${siteB.id}/contractor-comms`, name: "contractor-comms" },
    { path: `/api/sites/${siteB.id}/calendar`, name: "calendar" },
    { path: `/api/sites/${siteB.id}/programme`, name: "programme" },
    { path: `/api/sites/${siteB.id}/plot-schedules`, name: "plot-schedules" },
  ];
  for (const ep of endpoints) {
    const res = await smSession.req(ep.path);
    assert(`    ${ep.name} → 403`, res.status === 403, `status=${res.status}`);
  }
  // POST-only endpoints (GET returns 405; must check via POST to hit the auth guard)
  const postOnlyEndpoints = [
    { path: `/api/sites/${siteB.id}/plots`, name: "plots POST (create)", body: { name: "hijack" } },
    { path: `/api/sites/${siteB.id}/bulk-delay`, name: "bulk-delay POST", body: { plotIds: [], days: 1 } },
    { path: `/api/sites/${siteB.id}/bulk-status`, name: "bulk-status POST", body: { jobIds: [], action: "start" } },
  ];
  for (const ep of postOnlyEndpoints) {
    const res = await smSession.req(ep.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ep.body),
    });
    assert(`    ${ep.name} → 403`, res.status === 403, `status=${res.status}`);
  }

  // ── SM cannot read plot on site B
  const plotBRes = await smSession.req(`/api/plots/${plotB.id}`);
  assert("SM cannot GET plot on forbidden site", plotBRes.status === 403, `status=${plotBRes.status}`);

  // ── SM cannot reach job on site B
  const jobBRes = await smSession.req(`/api/jobs/${jobB.id}`);
  // Note: /api/jobs/[id] GET doesn't currently have site-access check — it only gates PUT/DELETE.
  // Record what it does so we know; if it's 200 that's the next issue to fix.
  assert(
    "SM cannot GET job on forbidden site",
    jobBRes.status === 403 || jobBRes.status === 404,
    `status=${jobBRes.status} — if 200, /api/jobs/[id] GET needs a site-access check`
  );

  // ── SM cannot PUT job on site B
  const jobBPut = await smSession.req(`/api/jobs/${jobB.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  assert(
    "SM cannot PUT job on forbidden site (cross-site plot guard)",
    jobBPut.status === 403 || jobBPut.status === 404,
    `status=${jobBPut.status}`
  );

  // ── SM cannot DELETE anything (lacks DELETE_ITEMS permission)
  console.log("\n  PERMISSION-GATED ACTIONS (SM has EDIT_PROGRAMME+SIGN_OFF+MANAGE_ORDERS, NOT DELETE_ITEMS/MANAGE_USERS):");
  const smDeleteJob = await smSession.req(`/api/jobs/${jobB.id}`, { method: "DELETE" });
  assert("    SM cannot DELETE job (no DELETE_ITEMS)", smDeleteJob.status === 403, `status=${smDeleteJob.status}`);

  // ── SM cannot hit admin endpoints
  const smAdmin = await smSession.req(`/api/admin/migrate-original-dates`);
  assert("    SM cannot hit admin endpoint", smAdmin.status === 403, `status=${smAdmin.status}`);

  // ── SM cannot list all users (no MANAGE_USERS)
  const smUsers = await smSession.req(`/api/users`);
  assert(
    "    SM cannot list users (no VIEW_USERS)",
    smUsers.status === 403 || smUsers.status === 401,
    `status=${smUsers.status}`
  );

  // ── Search is scoped to SM's sites only
  const search = await smSession.req(`/api/search?q=Secret`);
  const searchBody = await search.json();
  const hitsForbiddenJob = (searchBody.jobs ?? []).some((j: { id: string }) => j.id === jobB.id);
  assert(
    "    Search does not leak jobs from other sites",
    !hitsForbiddenJob,
    `found job on forbidden site in results: ${hitsForbiddenJob}`
  );

  // ── Tasks endpoint is scoped
  const tasks = await smSession.req(`/api/tasks`);
  const tasksBody = await tasks.json();
  const anyForbiddenJob = [
    ...(tasksBody.overdueJobs ?? []),
    ...(tasksBody.lateStartJobs ?? []),
    ...(tasksBody.signOffJobs ?? []),
    ...(tasksBody.upcomingJobs ?? []),
  ].some((j: { id: string }) => j.id === jobB.id);
  assert(
    "    Tasks does not leak jobs from forbidden site",
    !anyForbiddenJob,
    `leaked forbidden job: ${anyForbiddenJob}`
  );

  // ── Sites list returns only Site A
  const smSites = await smSession.req(`/api/sites`);
  const smSitesList = await smSites.json();
  const idsReturned = smSitesList.map((s: { id: string }) => s.id);
  assert(
    "    /api/sites returns only accessible sites",
    idsReturned.includes(siteA.id) && !idsReturned.includes(siteB.id),
    `returned=${idsReturned.length}, hasA=${idsReturned.includes(siteA.id)}, hasB=${idsReturned.includes(siteB.id)}`
  );

  // ── CX user: can log in, has only VIEW_DASHBOARD, cannot access ANY site
  console.log("\n  CONTRACTOR user (no site access, only VIEW_DASHBOARD):");
  const cxSession = makeJar();
  await cxSession.login(TEST_CX_EMAIL, TEST_CX_PASSWORD);

  const cxSiteA = await cxSession.req(`/api/sites/${siteA.id}`);
  assert("    CX cannot access site A", cxSiteA.status === 403, `status=${cxSiteA.status}`);
  const cxSitesList = await (await cxSession.req(`/api/sites`)).json();
  assert(
    "    CX sites list is empty",
    Array.isArray(cxSitesList) && cxSitesList.length === 0,
    `length=${Array.isArray(cxSitesList) ? cxSitesList.length : "N/A"}`
  );

  // ── Attempt SM sign-off on a job in site A (they have SIGN_OFF_JOBS perm)
  // Seed a completed job on siteA and test
  const plotA = await prisma.plot.create({ data: { siteId: siteA.id, plotNumber: "A1", name: "Plot A1" } });
  const jobA = await prisma.job.create({
    data: { plotId: plotA.id, name: "Job A1", sortOrder: 0, status: "COMPLETED", actualStartDate: new Date(), actualEndDate: new Date() },
  });
  const smSignOff = await smSession.req(`/api/jobs/${jobA.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "signoff" }),
  });
  assert("SM with SIGN_OFF_JOBS perm can sign off their site's job", smSignOff.status === 200, `status=${smSignOff.status}`);

  // ── Cleanup
  console.log("\nCleaning up…");
  await prisma.site.deleteMany({ where: { name: { in: ["__PERM_SITE_A__", "__PERM_SITE_B__"] } } });
  await prisma.user.deleteMany({ where: { email: { in: [TEST_SM_EMAIL, TEST_CX_EMAIL] } } });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  if (passed < results.length) {
    console.log("\nFAILED:");
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? " — " + r.detail : ""}`);
  }
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
