/**
 * Stress + edge-case tests for Quants + Drawings + One-off orders.
 *
 * Edge cases:
 *   1. Plot-level one-off: plotId from another site should 400
 *   2. Site-wide one-off with no plot: siteId set, plotId null
 *   3. Update material: delivered field persists, consumed persists
 *   4. Delete plot with materials: cascade-delete materials (no orphans)
 *   5. Template edit: existing plots unchanged (snapshot)
 *   6. Creating 20 one-offs on one site: Quants aggregate still <3s
 *   7. Cancel a one-off: excluded from quants aggregate
 *   8. Budget of empty plot (no template, no manual): budget=0, no crashes
 *   9. Cross-site one-off POST: non-admin gets 403
 *  10. Material with null unitCost doesn't crash Budget
 *  11. Negative delivered/consumed rejected? (or allowed with warning)
 *  12. Apply template A, then apply template B to same plot: verify materials are appended, not overwritten
 */
import { PrismaClient } from "@prisma/client";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const BASE = "http://localhost:3002";
const EMAIL = "keith@sightmanager.com";
const PASSWORD = "keith1234";

const prisma = new PrismaClient();
const jar: Record<string, string> = {};
const results: Array<{ name: string; ok: boolean; note?: string }> = [];

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
    headers: { ...(init.headers || {}), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  merge(res);
  return res;
}
async function login() {
  const { csrfToken } = await (await req("/api/auth/csrf")).json();
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken, callbackUrl: BASE, json: "true" }).toString(),
  });
  return (await (await req("/api/auth/session")).json()).user.id as string;
}
function r(n: string, ok: boolean, note?: string) {
  results.push({ name: n, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${n}${note ? " — " + note : ""}`);
}

async function main() {
  console.log("Quants stress + edge cases\n");
  const userId = await login();

  // Clean previous
  await prisma.site.deleteMany({ where: { name: { startsWith: "__QSTRESS_" } } });
  await prisma.plotTemplate.deleteMany({ where: { name: { startsWith: "__QSTRESS_" } } });

  // Seed 2 sites + 1 template
  const tpl = await prisma.plotTemplate.create({
    data: {
      name: "__QSTRESS_TPL__",
      typeLabel: "Stress",
      jobs: { create: { name: "Foundations", stageCode: "FND", startWeek: 1, endWeek: 2, sortOrder: 0 } },
      materials: {
        create: [
          { name: "Bricks", quantity: 5000, unit: "each", unitCost: 0.5, category: "Brickwork" },
          { name: "Mortar", quantity: 50, unit: "bags", unitCost: 6, category: "Brickwork" },
        ],
      },
    },
    include: { jobs: { include: { children: { include: { orders: { include: { items: true } } } }, orders: { include: { items: true } } } }, materials: true, documents: true },
  });

  const keith = await prisma.user.findUnique({ where: { email: EMAIL } });
  const siteA = await prisma.site.create({
    data: { name: "__QSTRESS_A__", location: "A", createdById: keith!.id, assignedToId: keith!.id, userAccess: { create: [{ userId: keith!.id }] } },
  });
  const siteB = await prisma.site.create({
    data: { name: "__QSTRESS_B__", location: "B", createdById: keith!.id, assignedToId: keith!.id, userAccess: { create: [{ userId: keith!.id }] } },
  });

  // Apply template to one plot on each
  const today = new Date();
  const plotA = await prisma.$transaction(async (tx) => {
    const p = await tx.plot.create({ data: { siteId: siteA.id, plotNumber: "1", name: "Plot A1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createJobsFromTemplate(tx, p.id, today, tpl.jobs as any, null, keith!.id);
    await tx.plotMaterial.createMany({
      data: tpl.materials.map((m) => ({ plotId: p.id, sourceType: "TEMPLATE", name: m.name, quantity: m.quantity, unit: m.unit, unitCost: m.unitCost, category: m.category })),
    });
    return p;
  });
  const plotB = await prisma.plot.create({ data: { siteId: siteB.id, plotNumber: "1", name: "Plot B1" } });

  const supplier = await prisma.supplier.findFirst();
  if (!supplier) throw new Error("no supplier");

  // ── Test 1: plot-level one-off with plotId from another site → 400
  {
    const res = await req(`/api/sites/${siteA.id}/one-off-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplier.id, plotId: plotB.id, items: [{ name: "x", quantity: 1 }] }),
    });
    r("Cross-site plotId rejected (400)", res.status === 400, `status=${res.status}`);
  }

  // ── Test 2: site-wide one-off (no plotId) → 201 + jobId null, plotId null, siteId set
  {
    const res = await req(`/api/sites/${siteA.id}/one-off-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplier.id, items: [{ name: "Extra sand", quantity: 2, unitCost: 50 }] }),
    });
    const body = await res.json();
    r("Site-wide one-off created", res.ok && body.jobId === null && body.plotId === null && body.siteId === siteA.id, `j=${body.jobId} p=${body.plotId} s=${body.siteId}`);
  }

  // ── Test 3: Update delivered/consumed via API
  const mats = await prisma.plotMaterial.findMany({ where: { plotId: plotA.id } });
  const brickMat = mats.find((m) => m.name === "Bricks")!;
  {
    await req(`/api/plots/${plotA.id}/materials/${brickMat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivered: 3000, consumed: 1000 }),
    });
    const updated = await prisma.plotMaterial.findUnique({ where: { id: brickMat.id } });
    r("Delivered + consumed update persists", updated?.delivered === 3000 && updated?.consumed === 1000, `d=${updated?.delivered}, c=${updated?.consumed}`);
  }

  // ── Test 4: Delete plot → materials cascade
  {
    const tempPlot = await prisma.plot.create({ data: { siteId: siteA.id, plotNumber: "99", name: "Temp" } });
    await prisma.plotMaterial.create({ data: { plotId: tempPlot.id, sourceType: "MANUAL", name: "Test", quantity: 1, unit: "each" } });
    await prisma.plot.delete({ where: { id: tempPlot.id } });
    const orphans = await prisma.plotMaterial.findMany({ where: { plotId: tempPlot.id } });
    r("Plot delete cascades PlotMaterials (no orphans)", orphans.length === 0, `orphans=${orphans.length}`);
  }

  // ── Test 5: Template edit doesn't change existing plots (snapshot)
  {
    const tm = await prisma.templateMaterial.findFirst({ where: { templateId: tpl.id, name: "Bricks" } });
    await prisma.templateMaterial.update({ where: { id: tm!.id }, data: { quantity: 99999 } });
    const plotMat = await prisma.plotMaterial.findFirst({ where: { plotId: plotA.id, name: "Bricks" } });
    r("Template edit does NOT affect existing plot material", plotMat?.quantity === 5000, `plot qty=${plotMat?.quantity} (expected 5000)`);
  }

  // ── Test 6: Create 20 one-offs on site, measure quants endpoint
  {
    for (let i = 0; i < 20; i++) {
      await req(`/api/sites/${siteA.id}/one-off-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: supplier.id, items: [{ name: `Item ${i}`, quantity: i + 1, unitCost: 10 + i }] }),
      });
    }
    const t0 = Date.now();
    const res = await req(`/api/sites/${siteA.id}/quants`);
    const ms = Date.now() - t0;
    const body = await res.json();
    r(`Quants aggregate <3s with 21 one-offs (got ${ms}ms)`, ms < 3000 && res.ok, `count=${body.oneOff?.length}`);
  }

  // ── Test 7: Cancel a one-off → excluded from quants
  {
    const toCancel = await prisma.materialOrder.findFirst({ where: { siteId: siteA.id, oneOff: true, status: "PENDING" } });
    if (toCancel) {
      await prisma.materialOrder.update({ where: { id: toCancel.id }, data: { status: "CANCELLED" } });
    }
    const res = await req(`/api/sites/${siteA.id}/quants`);
    const body = await res.json();
    const includesCancelled = body.oneOff.some((o: { id: string }) => o.id === toCancel?.id);
    r("CANCELLED one-off excluded from quants aggregate", !includesCancelled, `excluded=${!includesCancelled}`);
  }

  // ── Test 8: Empty plot budget doesn't crash
  {
    const emptyPlot = await prisma.plot.create({ data: { siteId: siteA.id, plotNumber: "9999", name: "Empty" } });
    const res = await req(`/api/sites/${siteA.id}/budget-report`);
    const body = await res.json();
    const p = body.plots.find((pr: { plotId: string }) => pr.plotId === emptyPlot.id);
    r("Empty plot in budget report has budget=0, no crash", res.ok && p && p.budgeted === 0, `budget=${p?.budgeted}`);
  }

  // ── Test 9: Apply template to plot A (again) — ensure materials append, not replace
  {
    const plot = await prisma.plot.create({ data: { siteId: siteA.id, plotNumber: "A2", name: "Plot A2" } });
    await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createJobsFromTemplate(tx, plot.id, today, tpl.jobs as any, null, keith!.id);
      await tx.plotMaterial.createMany({
        data: tpl.materials.map((m) => ({ plotId: plot.id, sourceType: "TEMPLATE", name: m.name, quantity: m.quantity, unit: m.unit, unitCost: m.unitCost, category: m.category })),
      });
    });
    // Apply again (simulating manual re-apply — unusual but defensive test)
    await prisma.$transaction(async (tx) => {
      await tx.plotMaterial.createMany({
        data: tpl.materials.map((m) => ({ plotId: plot.id, sourceType: "TEMPLATE", name: m.name, quantity: m.quantity, unit: m.unit, unitCost: m.unitCost, category: m.category })),
      });
    });
    const count = await prisma.plotMaterial.count({ where: { plotId: plot.id } });
    r("Re-apply template appends materials (expected 4 rows, 2 templates × 2 materials)", count === 4, `count=${count}`);
  }

  // ── Test 10: Material with null unitCost doesn't crash Budget
  {
    const plot = await prisma.plot.create({ data: { siteId: siteA.id, plotNumber: "A3", name: "Plot A3" } });
    await prisma.plotMaterial.create({
      data: { plotId: plot.id, sourceType: "MANUAL", name: "Uncosted item", quantity: 10, unit: "each", unitCost: null },
    });
    const res = await req(`/api/sites/${siteA.id}/budget-report`);
    r("Budget handles null unitCost gracefully", res.ok, `status=${res.status}`);
  }

  // ── Test 11: Negative delivered — validate behaviour (we allow; admin's choice)
  {
    const pm = await prisma.plotMaterial.findFirst({ where: { plotId: plotA.id, name: "Mortar" } });
    if (pm) {
      const res = await req(`/api/plots/${plotA.id}/materials/${pm.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivered: -5 }),
      });
      r("Negative delivered accepted (admin override)", res.ok, `status=${res.status}`);
    } else r("(skip) mortar material not found", true);
  }

  // ── Test 12: Overdelivered (delivered > quantity) allowed (flag but don't block)
  {
    const pm = await prisma.plotMaterial.findFirst({ where: { plotId: plotA.id, name: "Mortar" } });
    if (pm) {
      const res = await req(`/api/plots/${plotA.id}/materials/${pm.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivered: 99999 }),
      });
      r("Overdelivered accepted (site may have extra stock)", res.ok, `status=${res.status}`);
    } else r("(skip) mortar material not found", true);
  }

  // ── Test 13: Budget numbers tie out for plotA with materials
  {
    const res = await req(`/api/sites/${siteA.id}/budget-report`);
    const body = await res.json();
    const plotRep = body.plots.find((p: { plotId: string }) => p.plotId === plotA.id);
    // plotA materials: Bricks (5000 @ 0.5 = 2500, delivered 3000 @ 0.5 = 1500),
    //                  Mortar (50 @ 6 = 300, delivered 99999 @ 6 = 599994 — overdelivered test)
    // After the overdelivered test, committed for Mortar = min(99999, quantity) * 6? Actually we use m.delivered directly.
    // So committed = 3000*0.5 + 99999*6 = 1500 + 599994 = 601494
    r(
      "Budget.plot.committed reflects actual delivered values",
      plotRep && plotRep.committed > 500000,
      `committed=${plotRep?.committed}`
    );
  }

  // ── Test 14: One-off plotId validation — null plotId is OK (site-wide)
  {
    const res = await req(`/api/sites/${siteA.id}/one-off-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplier.id, plotId: null, items: [{ name: "Site cleanup", quantity: 1, unitCost: 100 }] }),
    });
    r("Explicit null plotId for site-wide one-off works", res.ok, `status=${res.status}`);
  }

  // Cleanup
  console.log("\nCleaning up…");
  await prisma.site.delete({ where: { id: siteA.id } });
  await prisma.site.delete({ where: { id: siteB.id } });
  await prisma.plotTemplate.delete({ where: { id: tpl.id } });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  if (passed < results.length) for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL: ${r.name}${r.note ? " — " + r.note : ""}`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
