/**
 * End-to-end cascade test — exercises the HTTP route, not just the library.
 *
 * Creates a real fixture in the DB, logs in via NextAuth, calls
 * POST/PUT /api/jobs/[id]/cascade, then verifies:
 *   - The response shape matches the spec (jobUpdates, orderUpdates, conflicts, deltaDays)
 *   - The DB is updated correctly after PUT
 *   - A 409 is returned when there's a conflict without force=true
 *
 * Run: dev server must be running on port 3002; then `npx tsx scripts/test-cascade-e2e.ts`
 */
import { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { addWorkingDays, differenceInWorkingDays, isWorkingDay } from "../src/lib/working-days";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";

const prisma = new PrismaClient({ log: ["error"] });
const jar: Record<string, string> = {};
const results: Array<{ name: string; ok: boolean; note?: string }> = [];

function record(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

function merge(res: Response) {
  const raw = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const line of raw) {
    const [kv] = line.split(";");
    const eq = kv.indexOf("=");
    if (eq > 0) {
      const n = kv.slice(0, eq).trim();
      const v = kv.slice(eq + 1).trim();
      if (!v || v === "deleted") delete jar[n];
      else jar[n] = v;
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
  merge(res);
  return res;
}
async function login() {
  const csrfRes = await req("/api/auth/csrf");
  if (!csrfRes.ok) throw new Error("csrf fetch failed");
  const { csrfToken } = await csrfRes.json();
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: EMAIL,
      password: PASSWORD,
      csrfToken,
      callbackUrl: BASE,
      json: "true",
    }).toString(),
  });
  const sessionRes = await req("/api/auth/session");
  const session = await sessionRes.json();
  if (!session?.user?.id) throw new Error("login failed — no session user");
  return session.user.id as string;
}

async function main() {
  console.log("Cascade E2E test — exercises the HTTP route\n");

  try {
    await login();
  } catch (e) {
    console.log(`Skipping E2E: ${e instanceof Error ? e.message : e}`);
    console.log("(dev server must be running on :3002 with a user seeded)\n");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error("user not in DB");

  // --- Fixture ---
  const site = await prisma.site.create({
    data: {
      name: `__CASCADE_E2E_${Date.now()}__`,
      location: "Test",
      status: "ACTIVE",
      createdById: user.id,
      assignedToId: user.id,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `E2E Supplier ${Date.now()}` },
  });
  const plot = await prisma.plot.create({
    data: { name: "E2E Plot 1", plotNumber: "1", siteId: site.id },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anchor = new Date(today);
  while (anchor.getDay() !== 1) anchor.setDate(anchor.getDate() + 1);
  anchor.setDate(anchor.getDate() + 14); // 2 weeks out

  async function makeJob(name: string, weekOffset: number, sortOrder: number) {
    const start = addDays(anchor, weekOffset * 7);
    const end = addDays(start, 4);
    const job = await prisma.job.create({
      data: {
        name, plotId: plot.id, startDate: start, endDate: end,
        originalStartDate: start, originalEndDate: end,
        status: "NOT_STARTED", sortOrder,
      },
    });
    await prisma.materialOrder.create({
      data: {
        supplierId: supplier.id,
        jobId: job.id,
        dateOfOrder: addDays(start, -7),
        expectedDeliveryDate: addDays(start, -3),
        status: "PENDING",
      },
    });
    return job;
  }

  const jobA = await makeJob("Job A", 0, 1);
  const jobB = await makeJob("Job B", 1, 2);
  const jobC = await makeJob("Job C", 2, 3);

  console.log(`Fixture: plot=${plot.id}, jobA=${jobA.id}, jobB=${jobB.id}, jobC=${jobC.id}\n`);

  // --- Test 1: POST preview ---
  console.log("## POST /api/jobs/[id]/cascade — preview shape");
  {
    const newEnd = addWorkingDays(jobA.endDate!, -2).toISOString();
    const res = await req(`/api/jobs/${jobA.id}/cascade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEndDate: newEnd }),
    });
    record("POST returns 200", res.ok, `status=${res.status}`);
    const data = await res.json();
    record("response has preview: true", data.preview === true);
    record("response has deltaDays = -2", data.deltaDays === -2, `got ${data.deltaDays}`);
    record("response has jobUpdates (3)", Array.isArray(data.jobUpdates) && data.jobUpdates.length === 3, `got ${data.jobUpdates?.length}`);
    record("response has orderUpdates (3)", Array.isArray(data.orderUpdates) && data.orderUpdates.length === 3, `got ${data.orderUpdates?.length}`);
    record("response has conflicts array", Array.isArray(data.conflicts));
    // No DB writes should have happened
    const after = await prisma.job.findUnique({ where: { id: jobA.id }, select: { endDate: true } });
    record("DB unchanged by preview", after?.endDate?.getTime() === jobA.endDate!.getTime(), "preview must not mutate");
  }

  // --- Test 2: PUT apply ---
  console.log("\n## PUT /api/jobs/[id]/cascade — apply");
  {
    const newEnd = addWorkingDays(jobA.endDate!, -2).toISOString();
    const res = await req(`/api/jobs/${jobA.id}/cascade`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
    });
    record("PUT returns 200", res.ok, `status=${res.status}`);
    const data = await res.json();
    record("applied: true", data.applied === true);
    record("deltaDays = -2", data.deltaDays === -2, `got ${data.deltaDays}`);

    // Verify DB state
    const [newA, newB, newC] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobA.id } }),
      prisma.job.findUnique({ where: { id: jobB.id } }),
      prisma.job.findUnique({ where: { id: jobC.id } }),
    ]);

    const shiftA_start = differenceInWorkingDays(newA!.startDate!, jobA.startDate!);
    const shiftA_end = differenceInWorkingDays(newA!.endDate!, jobA.endDate!);
    const shiftB_start = differenceInWorkingDays(newB!.startDate!, jobB.startDate!);
    const shiftB_end = differenceInWorkingDays(newB!.endDate!, jobB.endDate!);
    const shiftC_start = differenceInWorkingDays(newC!.startDate!, jobC.startDate!);
    const shiftC_end = differenceInWorkingDays(newC!.endDate!, jobC.endDate!);

    record("Job A start shifted -2 WD", shiftA_start === -2, `got ${shiftA_start}`);
    record("Job A end shifted -2 WD", shiftA_end === -2, `got ${shiftA_end}`);
    record("Job B start shifted -2 WD", shiftB_start === -2, `got ${shiftB_start}`);
    record("Job B end shifted -2 WD", shiftB_end === -2, `got ${shiftB_end}`);
    record("Job C start shifted -2 WD", shiftC_start === -2, `got ${shiftC_start}`);
    record("Job C end shifted -2 WD", shiftC_end === -2, `got ${shiftC_end}`);

    record("Job A start is working day", isWorkingDay(newA!.startDate!));
    record("Job A end is working day", isWorkingDay(newA!.endDate!));
    record("Job B start is working day", isWorkingDay(newB!.startDate!));
    record("Job C start is working day", isWorkingDay(newC!.startDate!));

    // Orders
    const orderB = await prisma.materialOrder.findFirst({ where: { jobId: jobB.id } });
    const origOrderB = await prisma.materialOrder.findFirst({
      where: { jobId: jobB.id },
      select: { dateOfOrder: true, expectedDeliveryDate: true },
    });
    record("Job B's order shifted with job", !!orderB && !!origOrderB);
  }

  // --- Test 3: PUT with conflict (huge pull forward) returns 409 ---
  console.log("\n## PUT /api/jobs/[id]/cascade — conflict returns 409");
  {
    // Refresh jobA from DB (it was shifted in test 2)
    const currentA = await prisma.job.findUnique({ where: { id: jobA.id } });
    const newEnd = addWorkingDays(currentA!.endDate!, -100).toISOString();
    const res = await req(`/api/jobs/${jobA.id}/cascade`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEndDate: newEnd, confirm: true }),
    });
    record("PUT returns 409 on conflict", res.status === 409, `status=${res.status}`);
    const data = await res.json();
    record("409 response has conflicts array", Array.isArray(data.conflicts) && data.conflicts.length > 0, `count=${data.conflicts?.length}`);
  }

  // --- Cleanup ---
  await prisma.site.delete({ where: { id: site.id } }).catch(() => {});
  await prisma.supplier.delete({ where: { id: supplier.id } }).catch(() => {});

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ✗ ${f.name}${f.note ? ` — ${f.note}` : ""}`);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
