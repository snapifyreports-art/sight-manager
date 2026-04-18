/**
 * Scale test: seed a site with 20 plots from The Willow (~560 jobs, ~340 orders)
 * and measure every consuming view's response time. Flags anything > 3000ms.
 *
 * Run: npx tsx scripts/test-scale.ts
 */
import { PrismaClient } from "@prisma/client";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";
const PLOT_COUNT = 20;
const SLOW_THRESHOLD_MS = 3000;

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
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const sess = await req("/api/auth/session");
  const sjson = await sess.json();
  return sjson.user.id as string;
}

async function timed(label: string, path: string) {
  const t0 = Date.now();
  const res = await req(path);
  const ms = Date.now() - t0;
  const flag = ms > SLOW_THRESHOLD_MS ? " ⚠ SLOW" : ms > 1500 ? " ·" : " ✓";
  const shape = res.ok ? (await res.json().then((b) => Array.isArray(b) ? `array[${b.length}]` : typeof b === "object" ? "obj" : "?").catch(() => "?")) : `HTTP ${res.status}`;
  console.log(`  ${flag} ${ms.toString().padStart(5)}ms  ${label.padEnd(28)} ${shape}`);
  return { ms, ok: res.ok };
}

async function clean() {
  const site = await prisma.site.findFirst({ where: { name: "__SCALE_TEST__" } });
  if (site) await prisma.site.delete({ where: { id: site.id } });
}

async function seed(userId: string) {
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
  if (!template) throw new Error("Willow template missing");

  const site = await prisma.site.create({
    data: {
      name: "__SCALE_TEST__",
      location: "Bristol",
      postcode: "BS1 1AA",
      createdById: userId,
      assignedToId: userId,
      userAccess: { create: [{ userId }] },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const seedT0 = Date.now();
  for (let n = 1; n <= PLOT_COUNT; n++) {
    await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.create({
        data: { siteId: site.id, plotNumber: String(n), name: `Plot ${n}`, houseType: template.typeLabel },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createJobsFromTemplate(tx, plot.id, today, template.jobs as any, null, userId);
    }, { timeout: 60_000 });
    process.stdout.write(`  seeded ${n}/${PLOT_COUNT}\r`);
  }
  console.log(`\n  ✓ ${PLOT_COUNT} plots seeded in ${Math.round((Date.now() - seedT0) / 1000)}s`);
  return site.id;
}

async function main() {
  console.log("Scale test: 20 plots × The Willow\n");
  await login();
  await clean();
  const userId = (await (await req("/api/auth/session")).json()).user.id;
  const siteId = await seed(userId);

  const jobCount = await prisma.job.count({ where: { plot: { siteId } } });
  const orderCount = await prisma.materialOrder.count({ where: { job: { plot: { siteId } } } });
  console.log(`\nDB state: ${jobCount} jobs, ${orderCount} orders\n`);

  console.log("View timings (site-scoped):");
  const timings: Array<{ ms: number; ok: boolean }> = [];
  timings.push(await timed("Daily Brief", `/api/sites/${siteId}/daily-brief`));
  timings.push(await timed("Delay Report", `/api/sites/${siteId}/delay-report`));
  timings.push(await timed("Budget Report", `/api/sites/${siteId}/budget-report`));
  timings.push(await timed("Cash Flow", `/api/sites/${siteId}/cash-flow`));
  timings.push(await timed("Weekly Report", `/api/sites/${siteId}/weekly-report`));
  timings.push(await timed("Site Calendar", `/api/sites/${siteId}/calendar`));
  timings.push(await timed("Walkthrough", `/api/sites/${siteId}/walkthrough`));
  timings.push(await timed("Contractor Comms", `/api/sites/${siteId}/contractor-comms`));
  timings.push(await timed("Day Sheets", `/api/sites/${siteId}/day-sheets`));
  timings.push(await timed("Site detail + plots", `/api/sites/${siteId}`));
  timings.push(await timed("Orders list (scoped)", `/api/sites/${siteId}/orders`));
  timings.push(await timed("Site log", `/api/sites/${siteId}/log`));
  timings.push(await timed("Site snags", `/api/sites/${siteId}/snags`));
  timings.push(await timed("Programme", `/api/sites/${siteId}/programme`));
  timings.push(await timed("Analytics", `/api/analytics?siteId=${siteId}`));
  timings.push(await timed("Tasks (user-scoped)", `/api/tasks`));

  console.log("\nSummary:");
  const slow = timings.filter((t) => t.ms > SLOW_THRESHOLD_MS);
  const failed = timings.filter((t) => !t.ok);
  const total = timings.reduce((s, t) => s + t.ms, 0);
  const avg = Math.round(total / timings.length);
  console.log(`  Avg: ${avg}ms  |  Slowest: ${Math.max(...timings.map((t) => t.ms))}ms  |  >${SLOW_THRESHOLD_MS}ms: ${slow.length}  |  Failed: ${failed.length}`);

  console.log("\nCleaning up…");
  await prisma.site.delete({ where: { id: siteId } });

  await prisma.$disconnect();
  process.exit(slow.length > 0 || failed.length > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
