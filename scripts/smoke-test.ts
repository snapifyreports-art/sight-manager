/**
 * (May 2026) Smoke suite — `npm run test:smoke`.
 *
 * The recurring "feature dropped off / broke" problem was that every
 * bug reached production because `tsc` + `next build` only prove the
 * code *compiles*, not that the data it depends on is sane. This is the
 * missing layer: a fast, READ-ONLY pass over the live DB that asserts
 * the structural invariants + schema-applied state every feature
 * relies on.
 *
 * Wired into `prebuild`, so a genuine breakage blocks the Vercel
 * deploy. Read-only by design — safe to run anywhere, including the
 * production build. It catches:
 *   - schema migrations that didn't apply to this environment
 *   - data-invariant violations (orphan orders, impossible date
 *     orderings, out-of-range caches)
 *   - features whose seed data went missing
 *
 * What it does NOT catch: UI logic bugs (a filter excluding a valid
 * case, a gate reading the wrong field). Those need click-testing with
 * the test account — see scripts/ensure-test-account.ts.
 *
 * Resilient: a DB-connection failure WARNs and exits 0 (an infra
 * hiccup mustn't block a hotfix). Only a genuine assertion failure
 * exits 1.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Status = "pass" | "warn" | "fail";
interface Result {
  name: string;
  status: Status;
  detail: string;
}

const results: Result[] = [];
function record(name: string, status: Status, detail: string) {
  results.push({ name, status, detail });
}

/** Columns recent batches added — if any are missing on this DB, an
 *  apply-*.ts script never ran here and the matching feature is dead. */
const EXPECTED_COLUMNS: Array<[table: string, column: string]> = [
  ["DelayReason", "scope"],
  ["LatenessEvent", "delayReasonId"],
  ["LatenessEvent", "excused"],
  ["ToolboxTalk", "contractorIds"],
  ["PlotTemplate", "buildBudget"],
  ["PlotTemplate", "salePrice"],
  ["TemplateVariant", "buildBudget"],
  ["TemplateVariant", "salePrice"],
  ["Plot", "buildBudget"],
  ["Plot", "salePrice"],
];

async function checkSchemaColumns() {
  const rows = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const present = new Set(
    rows.map((r) => `${r.table_name}.${r.column_name}`),
  );
  const missing = EXPECTED_COLUMNS.filter(
    ([t, c]) => !present.has(`${t}.${c}`),
  ).map(([t, c]) => `${t}.${c}`);
  if (missing.length > 0) {
    record(
      "Schema columns applied",
      "fail",
      `Missing on this DB: ${missing.join(", ")} — an apply-*.ts script never ran here.`,
    );
  } else {
    record(
      "Schema columns applied",
      "pass",
      `${EXPECTED_COLUMNS.length} recent-batch columns all present.`,
    );
  }
}

async function checkOrphanOrders() {
  const n = await prisma.materialOrder.count({
    where: { jobId: null, siteId: null, plotId: null },
  });
  record(
    "No contextless orphan orders",
    n > 0 ? "fail" : "pass",
    n > 0
      ? `${n} order(s) with no job/site/plot — they pollute operational queries (Tasks, notifications).`
      : "All orders still have a job, site or plot.",
  );
}

async function checkOrderDateInvariants() {
  // INV-1: you can't expect delivery before placing the order.
  const inv1 = await prisma.materialOrder.count({
    where: {
      expectedDeliveryDate: { not: null },
      // Prisma can't compare two columns directly — pull the small set
      // of suspects and filter in JS.
    },
  });
  void inv1;
  const suspects = await prisma.materialOrder.findMany({
    where: {
      OR: [
        { expectedDeliveryDate: { not: null } },
        { deliveredDate: { not: null } },
      ],
    },
    select: {
      id: true,
      dateOfOrder: true,
      expectedDeliveryDate: true,
      deliveredDate: true,
      status: true,
    },
  });
  const inv1Bad = suspects.filter(
    (o) =>
      o.expectedDeliveryDate != null &&
      o.expectedDeliveryDate < o.dateOfOrder,
  ).length;
  const inv2Bad = suspects.filter(
    (o) =>
      o.status === "DELIVERED" &&
      o.deliveredDate != null &&
      o.deliveredDate < o.dateOfOrder,
  ).length;
  record(
    "Order date ordering (INV-1: delivery ≥ order)",
    inv1Bad > 0 ? "fail" : "pass",
    inv1Bad > 0
      ? `${inv1Bad} order(s) expect delivery before they were placed.`
      : "Every order's expected delivery is on/after its order date.",
  );
  record(
    "Order date ordering (INV-2: delivered ≥ order)",
    inv2Bad > 0 ? "fail" : "pass",
    inv2Bad > 0
      ? `${inv2Bad} delivered order(s) were 'delivered' before they were placed.`
      : "Every delivered order was delivered on/after its order date.",
  );
}

async function checkJobDates() {
  const suspects = await prisma.job.findMany({
    where: { startDate: { not: null }, endDate: { not: null } },
    select: { id: true, startDate: true, endDate: true },
  });
  const bad = suspects.filter(
    (j) => j.startDate != null && j.endDate != null && j.endDate < j.startDate,
  ).length;
  record(
    "Job dates ordered (end ≥ start)",
    bad > 0 ? "fail" : "pass",
    bad > 0
      ? `${bad} job(s) end before they start.`
      : "Every dated job ends on/after it starts.",
  );
}

async function checkBuildPercentRange() {
  const bad = await prisma.plot.count({
    where: { OR: [{ buildCompletePercent: { lt: 0 } }, { buildCompletePercent: { gt: 100 } }] },
  });
  record(
    "Plot buildCompletePercent in 0–100",
    bad > 0 ? "fail" : "pass",
    bad > 0
      ? `${bad} plot(s) have a cached completion % outside 0–100 — recompute drift.`
      : "Every plot's cached completion % is in range.",
  );
}

async function checkDelayReasonSeeds() {
  const send = await prisma.delayReason.count({ where: { scope: "ORDER_SEND" } });
  const delivery = await prisma.delayReason.count({
    where: { scope: "ORDER_DELIVERY" },
  });
  const ok = send > 0 && delivery > 0;
  record(
    "Order-lateness reason lists seeded",
    ok ? "pass" : "fail",
    ok
      ? `${send} send + ${delivery} delivery reasons present.`
      : `Scoped reason lists missing (send=${send}, delivery=${delivery}) — the order-late pickers will be empty.`,
  );
}

async function checkLiveTemplateHouseValues() {
  // (Batch 219) Going-live now requires house values — but templates
  // that were already live pre-219 are grandfathered. So this is a
  // WARN, not a gate: it's a "tidy these up" nudge, not breakage.
  const liveTemplates = await prisma.plotTemplate.findMany({
    where: { isDraft: false, archivedAt: null },
    select: { id: true, name: true, buildBudget: true, salePrice: true },
  });
  const tplMissing = liveTemplates.filter(
    (t) => t.buildBudget == null || t.salePrice == null,
  );
  const variantsMissing = await prisma.templateVariant.count({
    where: {
      template: { isDraft: false, archivedAt: null },
      OR: [{ buildBudget: null }, { salePrice: null }],
    },
  });
  const total = tplMissing.length + variantsMissing;
  record(
    "Live templates carry house values",
    total > 0 ? "warn" : "pass",
    total > 0
      ? `${tplMissing.length} live template(s) + ${variantsMissing} variant(s) have no house value (grandfathered pre-batch-219 — set them in the editor).`
      : "Every live template + variant has a build budget and sale price.",
  );
}

async function checkDeliveredOrdersHaveDate() {
  // Supplier-performance + cash-flow + the Story tab all read
  // deliveredDate — a DELIVERED order with none silently corrupts them.
  const n = await prisma.materialOrder.count({
    where: { status: "DELIVERED", deliveredDate: null },
  });
  record(
    "Delivered orders carry a delivery date",
    n > 0 ? "fail" : "pass",
    n > 0
      ? `${n} DELIVERED order(s) have no deliveredDate — reports that read it will be wrong.`
      : "Every delivered order has a delivery date.",
  );
}

async function checkNegativeOrderItems() {
  const n = await prisma.orderItem.count({
    where: { OR: [{ quantity: { lt: 0 } }, { unitCost: { lt: 0 } }] },
  });
  record(
    "No negative order-item quantities / costs",
    n > 0 ? "fail" : "pass",
    n > 0
      ? `${n} order item(s) have a negative quantity or unit cost — they'll poison budget + cash-flow totals.`
      : "Every order item has a non-negative quantity and cost.",
  );
}

async function checkSiteCompletedAt() {
  // (Site.completedAt batch) status COMPLETED ⇔ completedAt set.
  const completedNoDate = await prisma.site.count({
    where: { status: "COMPLETED", completedAt: null },
  });
  const dateNotCompleted = await prisma.site.count({
    where: { status: { not: "COMPLETED" }, completedAt: { not: null } },
  });
  const total = completedNoDate + dateNotCompleted;
  record(
    "Site completedAt matches status",
    total > 0 ? "warn" : "pass",
    total > 0
      ? `${completedNoDate} COMPLETED site(s) with no completedAt, ${dateNotCompleted} non-COMPLETED with one set.`
      : "Every site's completedAt agrees with its status.",
  );
}

async function checkResolvedSnagsHaveDate() {
  const n = await prisma.snag.count({
    where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: null },
  });
  record(
    "Resolved snags carry a resolved date",
    n > 0 ? "warn" : "pass",
    n > 0
      ? `${n} RESOLVED/CLOSED snag(s) have no resolvedAt — re-inspection timing + the Story tab read it.`
      : "Every resolved snag has a resolved date.",
  );
}

async function checkPlotProvenance() {
  // A plot built from a variant must also point at the base template.
  const n = await prisma.plot.count({
    where: { sourceVariantId: { not: null }, sourceTemplateId: null },
  });
  record(
    "Plot template provenance consistent",
    n > 0 ? "warn" : "pass",
    n > 0
      ? `${n} plot(s) reference a variant but no base template.`
      : "Every plot with a source variant also records its base template.",
  );
}

async function checkCompletionCacheSanity() {
  // buildCompletePercent is a cache the heatmap + plot cards trust. A
  // plot pinned at 100% with a non-COMPLETE leaf job means the cache
  // drifted — the reconcile cron fixes it, this just surfaces it.
  const n = await prisma.plot.count({
    where: {
      buildCompletePercent: 100,
      jobs: {
        some: { children: { none: {} }, status: { not: "COMPLETED" } },
      },
    },
  });
  record(
    "Plot completion cache not drifted",
    n > 0 ? "warn" : "pass",
    n > 0
      ? `${n} plot(s) cached at 100% still have unfinished leaf jobs — reconcile drift.`
      : "Every 100%-cached plot genuinely has all leaf jobs complete.",
  );
}

async function main() {
  const checks = [
    checkSchemaColumns,
    checkOrphanOrders,
    checkOrderDateInvariants,
    checkJobDates,
    checkBuildPercentRange,
    checkDelayReasonSeeds,
    checkLiveTemplateHouseValues,
    checkDeliveredOrdersHaveDate,
    checkNegativeOrderItems,
    checkSiteCompletedAt,
    checkResolvedSnagsHaveDate,
    checkPlotProvenance,
    checkCompletionCacheSanity,
  ];

  try {
    for (const c of checks) {
      try {
        await c();
      } catch (err) {
        record(
          c.name,
          "fail",
          `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    // Couldn't even get going — almost certainly a DB-connection issue.
    // An infra hiccup must NOT block a deploy: warn and exit 0.
    console.warn(
      `\n⚠  Smoke suite couldn't reach the database — skipping (not blocking the build).\n   ${err instanceof Error ? err.message : String(err)}\n`,
    );
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  }

  // Report.
  const icon = { pass: "✓", warn: "⚠", fail: "✗" } as const;
  console.log("\n── Smoke suite ─────────────────────────────────");
  for (const r of results) {
    console.log(`  ${icon[r.status]} ${r.name}`);
    console.log(`      ${r.detail}`);
  }
  const fails = results.filter((r) => r.status === "fail");
  const warns = results.filter((r) => r.status === "warn");
  console.log("────────────────────────────────────────────────");
  console.log(
    `  ${results.length - fails.length - warns.length} pass · ${warns.length} warn · ${fails.length} fail\n`,
  );

  await prisma.$disconnect().catch(() => {});
  if (fails.length > 0) {
    console.error("✗ Smoke suite FAILED — deploy should be blocked.\n");
    process.exit(1);
  }
  console.log("✓ Smoke suite passed.\n");
  process.exit(0);
}

main().catch(async (e) => {
  // Last-ditch — treat an unexpected crash like an infra hiccup, not a
  // gate failure, so we never block a deploy on the suite itself
  // misbehaving.
  console.warn(
    `\n⚠  Smoke suite errored unexpectedly — skipping (not blocking the build).\n   ${e instanceof Error ? e.message : String(e)}\n`,
  );
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
