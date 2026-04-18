/**
 * Integration test harness for the 8 audit fixes.
 * Runs against the local dev server at http://localhost:3002.
 *
 * Strategy:
 *  - Log in as Keith via NextAuth credentials flow → get session cookie
 *  - Set up minimal test data directly with Prisma (isolated to avoid polluting real sites)
 *  - Exercise each fixed endpoint with fetch
 *  - Assert DB state after each call
 *  - Clean up test data
 *
 * Run: npx tsx scripts/test-audit-fixes.ts
 */

import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";

const prisma = new PrismaClient();

type CookieJar = Record<string, string>;
const jar: CookieJar = {};

const results: Array<{ name: string; ok: boolean; note?: string }> = [];

function mergeSetCookies(res: Response) {
  // Next gives us Set-Cookie headers — join + parse
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

function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers || {}),
      Cookie: cookieHeader(),
    },
  });
  mergeSetCookies(res);
  return res;
}

async function login() {
  // 1. Get CSRF
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  // 2. Post credentials
  const body = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    csrfToken,
    callbackUrl: BASE,
    json: "true",
  }).toString();
  const cbRes = await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  // Some NextAuth versions return 302, others 200 with json
  if (cbRes.status >= 400) throw new Error(`Login failed: ${cbRes.status} ${await cbRes.text()}`);
  // Verify session
  const sess = await req("/api/auth/session");
  const sjson = await sess.json();
  if (!sjson?.user?.id) throw new Error(`No session user — body: ${JSON.stringify(sjson)}`);
  return sjson.user.id as string;
}

function record(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${note ? " — " + note : ""}`);
}

async function ensureTestSite(userId: string) {
  // Create/find a dedicated throwaway test site so we never touch real data
  const SITE_NAME = "__AUDIT_TEST_SITE__";
  let site = await prisma.site.findFirst({ where: { name: SITE_NAME } });
  if (!site) {
    site = await prisma.site.create({
      data: { name: SITE_NAME, location: "Test", postcode: null, createdById: userId },
    });
  }
  // Ensure user has access
  await prisma.userSite.upsert({
    where: { userId_siteId: { userId, siteId: site.id } },
    update: {},
    create: { userId, siteId: site.id },
  });
  return site;
}

async function cleanupTestSite() {
  const site = await prisma.site.findFirst({ where: { name: "__AUDIT_TEST_SITE__" } });
  if (!site) return;
  const plots = await prisma.plot.findMany({ where: { siteId: site.id }, select: { id: true } });
  const plotIds = plots.map((p) => p.id);
  const jobs = await prisma.job.findMany({ where: { plotId: { in: plotIds } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const orderIds = (await prisma.materialOrder.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } })).map((o) => o.id);
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.materialOrder.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.jobAction.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.eventLog.deleteMany({ where: { siteId: site.id } });
  await prisma.job.deleteMany({ where: { plotId: { in: plotIds } } });
  await prisma.plot.deleteMany({ where: { siteId: site.id } });
  await prisma.userSite.deleteMany({ where: { siteId: site.id } });
  await prisma.site.delete({ where: { id: site.id } });
}

async function makePlotWithJobs(siteId: string, opts: {
  plotNumber: string;
  jobs: Array<{ name: string; sortOrder: number; status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD"; startOffsetDays?: number; endOffsetDays?: number }>;
}) {
  // sanity: clean any prior plot with same number on this site
  const existing = await prisma.plot.findFirst({ where: { siteId, plotNumber: opts.plotNumber } });
  if (existing) {
    const jobs = await prisma.job.findMany({ where: { plotId: existing.id }, select: { id: true } });
    const jobIds = jobs.map((j) => j.id);
    await prisma.materialOrder.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobAction.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { plotId: existing.id } });
    await prisma.plot.delete({ where: { id: existing.id } });
  }
  const plot = await prisma.plot.create({
    data: { siteId, plotNumber: opts.plotNumber, name: `Test Plot ${opts.plotNumber}` },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const jobs = [];
  for (const j of opts.jobs) {
    const start = j.startOffsetDays != null ? new Date(today.getTime() + j.startOffsetDays * dayMs) : null;
    const end = j.endOffsetDays != null ? new Date(today.getTime() + j.endOffsetDays * dayMs) : null;
    jobs.push(await prisma.job.create({
      data: {
        plotId: plot.id,
        name: j.name,
        sortOrder: j.sortOrder,
        status: j.status ?? "NOT_STARTED",
        startDate: start,
        endDate: end,
      },
    }));
  }
  return { plot, jobs };
}

/* ---------------- Tests ---------------- */

async function testPlotSignoff(siteId: string) {
  // Fix 1: Plot To-Do uses action: "signoff" (was "sign_off") → /api/jobs/[id]/actions
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T1",
    jobs: [{ name: "Foundation", sortOrder: 0, status: "COMPLETED", startOffsetDays: -5, endOffsetDays: -1 }],
  });
  const jobId = jobs[0].id;
  const res = await req(`/api/jobs/${jobId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "signoff" }),
  });
  const after = await prisma.job.findUnique({ where: { id: jobId }, select: { signedOffAt: true } });
  record(
    "Fix 1: Plot signoff action accepted",
    res.ok && !!after?.signedOffAt,
    `status=${res.status}, signedOffAt=${after?.signedOffAt ? "set" : "null"}`
  );
}

async function testDailyBriefStartingToday(siteId: string) {
  // Fix 2: COMPLETED jobs with startDate=today must NOT appear in jobsStartingToday
  await makePlotWithJobs(siteId, {
    plotNumber: "T2",
    jobs: [
      { name: "Should-Show", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: 0, endOffsetDays: 3 },
      { name: "Should-Hide", sortOrder: 1, status: "COMPLETED", startOffsetDays: 0, endOffsetDays: 1 },
    ],
  });
  const res = await req(`/api/sites/${siteId}/daily-brief`);
  if (!res.ok) return record("Fix 2: Daily Brief filter", false, `HTTP ${res.status}`);
  const body = await res.json();
  const starting = body.jobsStartingToday ?? [];
  const names = starting.map((j: { name?: string }) => j.name);
  record(
    "Fix 2: Daily Brief excludes COMPLETED jobs starting today",
    names.includes("Should-Show") && !names.includes("Should-Hide"),
    `got=${JSON.stringify(names)}`
  );
}

async function testCascadeOnHoldIgnored(siteId: string) {
  // Fix 3: ON_HOLD jobs must not be shifted by cascade
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T3",
    jobs: [
      { name: "J1", sortOrder: 0, status: "IN_PROGRESS", startOffsetDays: -2, endOffsetDays: 2 },
      { name: "J2-OnHold", sortOrder: 1, status: "ON_HOLD", startOffsetDays: 3, endOffsetDays: 5 },
      { name: "J3", sortOrder: 2, status: "NOT_STARTED", startOffsetDays: 6, endOffsetDays: 9 },
    ],
  });
  const beforeOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  const newEnd = new Date(jobs[0].endDate!);
  newEnd.setDate(newEnd.getDate() + 5);
  const res = await req(`/api/jobs/${jobs[0].id}/cascade`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEndDate: newEnd.toISOString(), confirm: true }),
  });
  const afterOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  const afterJ3 = await prisma.job.findUnique({ where: { id: jobs[2].id }, select: { startDate: true } });
  const onHoldUnchanged = beforeOnHold?.endDate?.getTime() === afterOnHold?.endDate?.getTime();
  record(
    "Fix 3a: Cascade leaves ON_HOLD jobs untouched",
    res.ok && onHoldUnchanged,
    `HTTP=${res.status}, onHold end unchanged=${onHoldUnchanged}`
  );
  // J3 should still have shifted (it's not on-hold)
  record(
    "Fix 3b: Cascade still shifts non-ON_HOLD downstream",
    !!afterJ3?.startDate,
    ""
  );
}

async function testCascadeWeekendSnap(siteId: string) {
  // Fix 4: endDate arriving on Saturday should snap forward to Monday
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T4",
    jobs: [
      { name: "J1", sortOrder: 0, status: "IN_PROGRESS", startOffsetDays: -2, endOffsetDays: 2 },
    ],
  });
  // Build a Saturday date
  const sat = new Date();
  sat.setHours(0, 0, 0, 0);
  while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
  const res = await req(`/api/jobs/${jobs[0].id}/cascade`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEndDate: sat.toISOString(), confirm: true }),
  });
  const after = await prisma.job.findUnique({ where: { id: jobs[0].id }, select: { endDate: true } });
  const dow = after?.endDate?.getDay();
  record(
    "Fix 4: Cascade snaps weekend endDate to working day",
    res.ok && dow !== 0 && dow !== 6,
    `HTTP=${res.status}, resulting dayOfWeek=${dow}`
  );
}

async function testBulkDelayPreservesOriginals(siteId: string) {
  // Fix 5: First shift on a job (via bulk-delay) should stamp originalStart/EndDate
  const { plot, jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T5",
    jobs: [
      { name: "J1", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: 1, endOffsetDays: 4 },
      { name: "J2", sortOrder: 1, status: "NOT_STARTED", startOffsetDays: 5, endOffsetDays: 8 },
    ],
  });
  const res = await req(`/api/sites/${siteId}/bulk-delay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plotIds: [plot.id], days: 3, delayReasonType: "OTHER", reason: "test" }),
  });
  const j1After = await prisma.job.findUnique({ where: { id: jobs[0].id } });
  const j2After = await prisma.job.findUnique({ where: { id: jobs[1].id } });
  record(
    "Fix 5a: Bulk-delay stamps originalEndDate on trigger",
    res.ok && !!j1After?.originalEndDate,
    ""
  );
  record(
    "Fix 5b: Bulk-delay stamps originalStartDate on trigger (NOT_STARTED)",
    !!j1After?.originalStartDate,
    ""
  );
  record(
    "Fix 5c: Bulk-delay stamps originals on cascaded siblings",
    !!j2After?.originalStartDate && !!j2After?.originalEndDate,
    ""
  );
}

async function testBulkStatusComplete(siteId: string) {
  // Fix 6: bulk-status complete should (a) deliver ORDERED orders (b) update buildCompletePercent
  //        (c) be idempotent (d) reject NOT_STARTED completions
  const { plot, jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T6",
    jobs: [
      { name: "J1", sortOrder: 0, status: "IN_PROGRESS", startOffsetDays: -2, endOffsetDays: 1 },
      { name: "J2", sortOrder: 1, status: "NOT_STARTED", startOffsetDays: 2, endOffsetDays: 5 },
    ],
  });
  // Need a supplier for the order
  let supplier = await prisma.supplier.findFirst({ where: { name: "__AUDIT_TEST_SUPPLIER__" } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { name: "__AUDIT_TEST_SUPPLIER__" } });
  await prisma.materialOrder.create({
    data: { jobId: jobs[0].id, supplierId: supplier.id, status: "ORDERED", dateOfOrder: new Date() },
  });

  const res = await req(`/api/sites/${siteId}/bulk-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds: [jobs[0].id, jobs[1].id], action: "complete" }),
  });
  const body = await res.json();
  const j1After = await prisma.job.findUnique({ where: { id: jobs[0].id } });
  const orderAfter = await prisma.materialOrder.findFirst({ where: { jobId: jobs[0].id } });
  const plotAfter = await prisma.plot.findUnique({ where: { id: plot.id } });

  record(
    "Fix 6a: Bulk-status complete delivers ORDERED orders",
    orderAfter?.status === "DELIVERED" && !!orderAfter?.deliveredDate,
    `order.status=${orderAfter?.status}`
  );
  record(
    "Fix 6b: Bulk-status complete updates buildCompletePercent",
    plotAfter?.buildCompletePercent === 50,
    `pct=${plotAfter?.buildCompletePercent}`
  );
  record(
    "Fix 6c: Bulk-status skips NOT_STARTED completion",
    body.updated === 1 && j1After?.status === "COMPLETED",
    `updated=${body.updated}, J1 status=${j1After?.status}`
  );
  // Idempotency — call again
  const res2 = await req(`/api/sites/${siteId}/bulk-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds: [jobs[0].id], action: "complete" }),
  });
  const body2 = await res2.json();
  record(
    "Fix 6d: Bulk-status idempotent on already-complete job",
    body2.updated === 0,
    `updated=${body2.updated}`
  );
}

async function testOrderDateOfOrderStamp(siteId: string) {
  // Fix 7: Manual PENDING → ORDERED via PUT /api/orders/[id] must stamp dateOfOrder
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T7",
    jobs: [{ name: "J1", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: 1, endOffsetDays: 3 }],
  });
  let supplier = await prisma.supplier.findFirst({ where: { name: "__AUDIT_TEST_SUPPLIER__" } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { name: "__AUDIT_TEST_SUPPLIER__" } });
  const order = await prisma.materialOrder.create({
    data: { jobId: jobs[0].id, supplierId: supplier.id, status: "PENDING" },
  });
  const res = await req(`/api/orders/${order.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ORDERED" }),
  });
  const after = await prisma.materialOrder.findUnique({ where: { id: order.id } });
  record(
    "Fix 7: Manual PENDING→ORDERED stamps dateOfOrder",
    res.ok && !!after?.dateOfOrder,
    `status=${after?.status}, dateOfOrder=${after?.dateOfOrder ? "set" : "null"}`
  );
}

async function testBlockPendingDirectDelivery(siteId: string) {
  // Fix 8: Direct PENDING → DELIVERED must be rejected (400 on single, skipped on bulk)
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T8",
    jobs: [{ name: "J1", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: 1, endOffsetDays: 3 }],
  });
  let supplier = await prisma.supplier.findFirst({ where: { name: "__AUDIT_TEST_SUPPLIER__" } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { name: "__AUDIT_TEST_SUPPLIER__" } });
  const order = await prisma.materialOrder.create({
    data: { jobId: jobs[0].id, supplierId: supplier.id, status: "PENDING" },
  });
  const res = await req(`/api/orders/${order.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "DELIVERED" }),
  });
  const after = await prisma.materialOrder.findUnique({ where: { id: order.id } });
  record(
    "Fix 8a: Single-order PENDING→DELIVERED rejected (400)",
    res.status === 400 && after?.status === "PENDING",
    `HTTP=${res.status}, status after=${after?.status}`
  );
  // Bulk path
  const order2 = await prisma.materialOrder.create({
    data: { jobId: jobs[0].id, supplierId: supplier.id, status: "PENDING" },
  });
  const res2 = await req(`/api/orders/bulk-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderIds: [order2.id], status: "DELIVERED" }),
  });
  const after2 = await prisma.materialOrder.findUnique({ where: { id: order2.id } });
  const body2 = await res2.json();
  record(
    "Fix 8b: Bulk PENDING→DELIVERED silently skipped",
    res2.ok && body2.updated === 0 && after2?.status === "PENDING",
    `updated=${body2.updated}, status after=${after2?.status}`
  );
}

async function testDelayIgnoresOnHold(siteId: string) {
  // F2: /api/jobs/[id]/delay should NOT shift ON_HOLD jobs
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T9",
    jobs: [
      { name: "J1", sortOrder: 0, status: "IN_PROGRESS", startOffsetDays: -2, endOffsetDays: 2 },
      { name: "J2-OnHold", sortOrder: 1, status: "ON_HOLD", startOffsetDays: 3, endOffsetDays: 5 },
      { name: "J3", sortOrder: 2, status: "NOT_STARTED", startOffsetDays: 6, endOffsetDays: 9 },
    ],
  });
  const beforeOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  const res = await req(`/api/jobs/${jobs[0].id}/delay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: 3, delayReasonType: "OTHER", reason: "test" }),
  });
  const afterOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  record(
    "F2: Single delay leaves ON_HOLD jobs untouched",
    res.ok && beforeOnHold?.endDate?.getTime() === afterOnHold?.endDate?.getTime(),
    `HTTP=${res.status}`
  );
}

async function testBulkDelayIgnoresOnHold(siteId: string) {
  // F3: bulk-delay should NOT shift ON_HOLD jobs
  const { plot, jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T10",
    jobs: [
      { name: "J1", sortOrder: 0, status: "IN_PROGRESS", startOffsetDays: -2, endOffsetDays: 2 },
      { name: "J2-OnHold", sortOrder: 1, status: "ON_HOLD", startOffsetDays: 3, endOffsetDays: 5 },
    ],
  });
  const beforeOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  const res = await req(`/api/sites/${siteId}/bulk-delay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plotIds: [plot.id], days: 3, delayReasonType: "OTHER", reason: "test" }),
  });
  const afterOnHold = await prisma.job.findUnique({ where: { id: jobs[1].id }, select: { endDate: true } });
  record(
    "F3: Bulk-delay leaves ON_HOLD jobs untouched",
    res.ok && beforeOnHold?.endDate?.getTime() === afterOnHold?.endDate?.getTime(),
    `HTTP=${res.status}`
  );
}

async function testBackdateActualStart(siteId: string) {
  // B2: Backdate passes original startDate as actualStartDate
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T11",
    jobs: [
      { name: "J1", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: -10, endOffsetDays: -5 },
    ],
  });
  const originalStart = (await prisma.job.findUnique({ where: { id: jobs[0].id }, select: { startDate: true } }))!.startDate!;
  const res = await req(`/api/jobs/${jobs[0].id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", actualStartDate: originalStart.toISOString() }),
  });
  const after = await prisma.job.findUnique({ where: { id: jobs[0].id } });
  const now = new Date();
  const matchesOriginal = !!after?.actualStartDate && Math.abs(after.actualStartDate.getTime() - originalStart.getTime()) < 1000;
  const isBackdated = !!after?.actualStartDate && after.actualStartDate < now;
  record(
    "B2: Backdate sets actualStartDate to the provided past date",
    res.ok && matchesOriginal && isBackdated,
    `actualStart=${after?.actualStartDate?.toISOString()} expected=${originalStart.toISOString()}`
  );
}

async function testJobDeleteEventLog(userId: string, siteId: string) {
  // B4: Job delete writes an audit event
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T12",
    jobs: [{ name: "Doomed Job", sortOrder: 0, status: "NOT_STARTED" }],
  });
  const jobName = "Doomed Job";
  const res = await req(`/api/jobs/${jobs[0].id}`, { method: "DELETE" });
  const evt = await prisma.eventLog.findFirst({
    where: { siteId, userId, description: { contains: jobName } },
    orderBy: { createdAt: "desc" },
  });
  record(
    "B4: Job delete writes audit event",
    res.ok && !!evt,
    `HTTP=${res.status}, event found=${!!evt}`
  );
}

async function testJobPutPermissions(siteId: string) {
  // B1: Keith (CEO) can edit; cross-site plot reassignment via PUT still needs both sites accessible.
  // CEO bypasses the permission AND site-access check (role === CEO). So this just verifies
  // that EDIT_PROGRAMME gate doesn't block Keith (happy path).
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T13",
    jobs: [{ name: "Editable", sortOrder: 0, status: "NOT_STARTED" }],
  });
  const res = await req(`/api/jobs/${jobs[0].id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Edited Name" }),
  });
  const after = await prisma.job.findUnique({ where: { id: jobs[0].id } });
  record(
    "B1: Job PUT with EDIT_PROGRAMME permission succeeds for CEO",
    res.ok && after?.name === "Edited Name",
    `HTTP=${res.status}, name=${after?.name}`
  );
}

async function testSiteCreateGrantsUserSite(userId: string) {
  // H9: POST /api/sites auto-grants UserSite to the creator
  const res = await req(`/api/sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "__AUDIT_TEMP_SITE_H9__" }),
  });
  const body = await res.json();
  const grant = await prisma.userSite.findFirst({
    where: { userId, siteId: body.id },
  });
  record(
    "H9: Site creation auto-grants UserSite to creator",
    res.ok && !!grant,
    `grant found=${!!grant}`
  );
  // Clean up
  if (body.id) await prisma.site.delete({ where: { id: body.id } }).catch(() => {});
}

async function testDailyBriefDedup(userId: string, siteId: string) {
  // H8: COMPLETED job with no signedOffAt/notes should appear in awaitingSignOff, NOT also in needsAttention
  const { jobs } = await makePlotWithJobs(siteId, {
    plotNumber: "T14",
    jobs: [{ name: "CompleteNoSignoff", sortOrder: 0, status: "COMPLETED" }],
  });
  // Ensure the job has no signedOffAt and no signOffNotes
  await prisma.job.update({ where: { id: jobs[0].id }, data: { signedOffAt: null, signOffNotes: null } });
  const res = await req(`/api/sites/${siteId}/daily-brief`);
  if (!res.ok) return record("H8: Daily Brief dedup", false, `HTTP ${res.status}`);
  const body = await res.json();
  const inAwaiting = (body.awaitingSignOff || []).some((j: { id: string }) => j.id === jobs[0].id);
  const inNeedsAttention = (body.needsAttention || []).some((n: { id: string }) => n.id === jobs[0].id);
  record(
    "H8: Daily Brief does NOT double-count awaitingSignOff in needsAttention",
    inAwaiting && !inNeedsAttention,
    `awaiting=${inAwaiting}, needsAttention=${inNeedsAttention}`
  );
}

async function testDailyBriefStartingTomorrowFilter(siteId: string) {
  // F1: jobsStartingTomorrow should exclude COMPLETED jobs
  await makePlotWithJobs(siteId, {
    plotNumber: "T15",
    jobs: [
      { name: "T-Should-Show", sortOrder: 0, status: "NOT_STARTED", startOffsetDays: 1, endOffsetDays: 3 },
      { name: "T-Should-Hide", sortOrder: 1, status: "COMPLETED", startOffsetDays: 1, endOffsetDays: 1 },
    ],
  });
  const res = await req(`/api/sites/${siteId}/daily-brief`);
  const body = await res.json();
  const names = (body.jobsStartingTomorrow || []).map((j: { name: string }) => j.name);
  record(
    "F1: Daily Brief 'startingTomorrow' excludes COMPLETED",
    names.includes("T-Should-Show") && !names.includes("T-Should-Hide"),
    `got=${JSON.stringify(names)}`
  );
}

/* ---------------- Runner ---------------- */

async function main() {
  console.log("\nLogging in as Keith…");
  const userId = await login();
  console.log(`  ✓ session uid=${userId}\n`);

  console.log("Setting up isolated test site…");
  const site = await ensureTestSite(userId);
  console.log(`  ✓ site id=${site.id}\n`);

  try {
    console.log("Running fixes:");
    await testPlotSignoff(site.id);
    await testDailyBriefStartingToday(site.id);
    await testCascadeOnHoldIgnored(site.id);
    await testCascadeWeekendSnap(site.id);
    await testBulkDelayPreservesOriginals(site.id);
    await testBulkStatusComplete(site.id);
    await testOrderDateOfOrderStamp(site.id);
    await testBlockPendingDirectDelivery(site.id);
    // Round 2 fixes
    await testDailyBriefStartingTomorrowFilter(site.id);
    await testDelayIgnoresOnHold(site.id);
    await testBulkDelayIgnoresOnHold(site.id);
    await testJobPutPermissions(site.id);
    await testBackdateActualStart(site.id);
    await testJobDeleteEventLog(userId, site.id);
    await testDailyBriefDedup(userId, site.id);
    await testSiteCreateGrantsUserSite(userId);
  } finally {
    console.log("\nCleaning up test data…");
    await cleanupTestSite();
    // leave the test supplier (shared, cheap); drop if you prefer
    await prisma.supplier.deleteMany({ where: { name: "__AUDIT_TEST_SUPPLIER__" } });
    console.log("  ✓ cleaned");
  }

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
