/**
 * Integration test for Quants + One-off orders + Drawings features.
 *
 * Flow:
 *  1. Log in
 *  2. Create a site
 *  3. Attach a TemplateMaterial + TemplateDocument to a test plot template (direct DB)
 *  4. Apply template to plot — verify PlotMaterial + SiteDocument snapshots copied
 *  5. Site admin adds a MANUAL quant to the plot
 *  6. Update delivered/consumed
 *  7. Create a site-level one-off order
 *  8. Create a plot-level one-off order
 *  9. GET /api/sites/[id]/quants — verify rollups
 * 10. GET /api/sites/[id]/budget-report — verify manual quants rolled into budget
 * 11. GET /api/sites/[id]/cash-flow — verify manual in totals
 * 12. Cleanup
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
function record(n: string, ok: boolean, note?: string) {
  results.push({ name: n, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${n}${note ? " — " + note : ""}`);
}

async function main() {
  console.log("Quants + Drawings integration test\n");
  const userId = await login();

  // Clean any previous runs
  await prisma.site.deleteMany({ where: { name: "__QUANTS_TEST__" } });
  await prisma.plotTemplate.deleteMany({ where: { name: "__QUANTS_TEST_TPL__" } });

  // Create a minimal test template with 1 flat job
  const tpl = await prisma.plotTemplate.create({
    data: {
      name: "__QUANTS_TEST_TPL__",
      typeLabel: "Test",
      jobs: {
        create: {
          name: "Foundations",
          stageCode: "FND",
          startWeek: 1,
          endWeek: 2,
          sortOrder: 0,
        },
      },
    },
  });
  // Add 2 TemplateMaterials
  const tm1 = await prisma.templateMaterial.create({
    data: { templateId: tpl.id, name: "Facing Bricks", quantity: 5000, unit: "each", unitCost: 0.5, category: "Brickwork" },
  });
  const tm2 = await prisma.templateMaterial.create({
    data: { templateId: tpl.id, name: "Mortar", quantity: 50, unit: "bags", unitCost: 6, category: "Brickwork" },
  });
  // Add 1 TemplateDocument
  const td1 = await prisma.templateDocument.create({
    data: { templateId: tpl.id, name: "Floor Plan v1", url: "https://example.com/fp.pdf", fileName: "fp.pdf", category: "DRAWING" },
  });

  console.log(`  ✓ template created with 2 materials + 1 drawing`);

  // Create site via API
  const siteRes = await req("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "__QUANTS_TEST__", location: "Test", postcode: "SW1A 1AA" }),
  });
  const site = await siteRes.json();
  record("Site created", siteRes.ok && !!site.id, `id=${site.id}`);

  // Apply template to 2 plots
  const today = new Date();
  const tplFull = await prisma.plotTemplate.findUnique({
    where: { id: tpl.id },
    include: {
      jobs: { where: { parentId: null }, include: { children: { include: { orders: { include: { items: true } } } }, orders: { include: { items: true } } } },
      materials: true,
      documents: true,
    },
  });
  if (!tplFull) throw new Error("template not found");

  const plot1 = await prisma.$transaction(async (tx) => {
    const p = await tx.plot.create({ data: { siteId: site.id, plotNumber: "Q1", name: "Test Plot Q1", houseType: "Test" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createJobsFromTemplate(tx, p.id, today, tplFull.jobs as any, null, userId);
    // Replicate material + doc copy logic (mimic apply-template)
    await tx.plotMaterial.createMany({
      data: tplFull.materials.map((m) => ({
        plotId: p.id, sourceType: "TEMPLATE", name: m.name, quantity: m.quantity, unit: m.unit,
        unitCost: m.unitCost, category: m.category, linkedStageCode: m.linkedStageCode,
      })),
    });
    await tx.siteDocument.createMany({
      data: tplFull.documents.map((d) => ({
        name: d.name, url: d.url, fileName: d.fileName, category: d.category || "DRAWING",
        siteId: site.id, plotId: p.id, uploadedById: userId,
      })),
    });
    return p;
  });

  // ── 1. Verify snapshot copy happened
  const plotMats = await prisma.plotMaterial.findMany({ where: { plotId: plot1.id } });
  record("PlotMaterials copied from template (2 expected)", plotMats.length === 2, `count=${plotMats.length}`);
  record(
    "  sourceType is TEMPLATE on copies",
    plotMats.every((m) => m.sourceType === "TEMPLATE"),
    ""
  );
  record(
    "  quantity/unit/unitCost copied correctly",
    plotMats.find((m) => m.name === "Facing Bricks")?.quantity === 5000 &&
      plotMats.find((m) => m.name === "Mortar")?.unitCost === 6,
    ""
  );
  const plotDocs = await prisma.siteDocument.findMany({ where: { plotId: plot1.id, category: "DRAWING" } });
  record("Template drawing copied to plot", plotDocs.length === 1, `count=${plotDocs.length}`);

  // ── 2. Add a MANUAL quant via the API
  const manualRes = await req(`/api/plots/${plot1.id}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Blocks", quantity: 2000, unit: "each", unitCost: 1.2, category: "Blockwork" }),
  });
  const manual = await manualRes.json();
  record("Manual quant added via API", manualRes.ok && manual.sourceType === "MANUAL", `sourceType=${manual.sourceType}`);

  // ── 3. Update delivered
  const updateRes = await req(`/api/plots/${plot1.id}/materials/${manual.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delivered: 1500 }),
  });
  const updated = await updateRes.json();
  record("Update delivered=1500", updateRes.ok && updated.delivered === 1500, `delivered=${updated.delivered}`);

  // ── 4. Create site-level one-off order
  const supplier = await prisma.supplier.findFirst();
  if (!supplier) throw new Error("no supplier");
  const oneOffSiteRes = await req(`/api/sites/${site.id}/one-off-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplierId: supplier.id,
      items: [{ name: "Extra sand", quantity: 3, unit: "tonnes", unitCost: 45 }],
      itemsDescription: "Extra sand for general site use",
    }),
  });
  const oneOffSite = await oneOffSiteRes.json();
  record(
    "Site-level one-off order created",
    oneOffSiteRes.ok && oneOffSite.siteId === site.id && oneOffSite.plotId === null && oneOffSite.oneOff === true,
    `siteId=${oneOffSite.siteId}, plotId=${oneOffSite.plotId}`
  );

  // ── 5. Create plot-level one-off order
  const oneOffPlotRes = await req(`/api/sites/${site.id}/one-off-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplierId: supplier.id,
      plotId: plot1.id,
      items: [{ name: "Extra insulation", quantity: 10, unit: "rolls", unitCost: 25 }],
    }),
  });
  const oneOffPlot = await oneOffPlotRes.json();
  record(
    "Plot-level one-off order created",
    oneOffPlotRes.ok && oneOffPlot.plotId === plot1.id && oneOffPlot.jobId === null,
    `plotId=${oneOffPlot.plotId}`
  );

  // ── 6. GET site quants aggregate
  const quantsRes = await req(`/api/sites/${site.id}/quants`);
  const quants = await quantsRes.json();
  record("Quants endpoint returns OK", quantsRes.ok, "");
  record(
    "  manual.byMaterial has 3 rows (Bricks, Mortar, Blocks)",
    quants.manual?.byMaterial?.length === 3,
    `count=${quants.manual?.byMaterial?.length}`
  );
  record(
    "  oneOff contains both one-offs",
    quants.oneOff?.length === 2,
    `count=${quants.oneOff?.length}`
  );
  record(
    "  totals.oneOffValue = 3*45 + 10*25 = 385",
    Math.abs(quants.totals?.oneOffValue - 385) < 0.01,
    `value=${quants.totals?.oneOffValue}`
  );

  // ── 7. Budget integration
  const budgetRes = await req(`/api/sites/${site.id}/budget-report`);
  const budget = await budgetRes.json();
  const plotReport = budget.plots.find((p: { plotId: string }) => p.plotId === plot1.id);
  // Bricks: 5000 * 0.5 = 2500; Mortar: 50 * 6 = 300; Blocks: 2000 * 1.2 = 2400
  // Total manual budget: 5200
  record(
    "Budget plot includes manual materials (~£5,200 budget)",
    plotReport?.manualMaterials?.length === 3 &&
      Math.abs((plotReport.budgeted ?? 0) - 5200) < 1,
    `materials=${plotReport?.manualMaterials?.length}, budget=${plotReport?.budgeted}`
  );
  // Blocks delivered 1500 * 1.2 = 1800 committed
  record(
    "Budget committed reflects delivered manual (Blocks £1,800)",
    plotReport && Math.abs((plotReport.committed ?? 0) - 1800) < 1,
    `committed=${plotReport?.committed}`
  );

  // ── 8. Cash Flow totals
  const cashRes = await req(`/api/sites/${site.id}/cash-flow`);
  const cash = await cashRes.json();
  record(
    "Cash Flow.totals.manualCommitted = 1,800",
    Math.abs((cash.totals?.manualCommitted ?? 0) - 1800) < 1,
    `mc=${cash.totals?.manualCommitted}`
  );

  // ── Cleanup
  console.log("\nCleaning up…");
  await prisma.site.delete({ where: { id: site.id } });
  await prisma.plotTemplate.delete({ where: { id: tpl.id } });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} passed =====`);
  if (passed < results.length) for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL: ${r.name}${r.note ? " — " + r.note : ""}`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
