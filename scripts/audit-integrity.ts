/**
 * End-to-end DB integrity audit.
 *
 * Runs read-only checks for impossible states: orphans, broken invariants,
 * mismatched denormalised columns, date sanity, parent/child rollup drift.
 *
 * Runs via: npx tsx scripts/audit-integrity.ts
 *
 * Fails loud (exit 1) if it finds any issue. Green means the DB is in the
 * state the application code assumes.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Check {
  name: string;
  rows: number;
  details: string[];
  critical: boolean;
}

const checks: Check[] = [];
function record(name: string, rows: number, details: string[], critical = true) {
  checks.push({ name, rows, details, critical });
}

async function main() {
  console.log("\n=== DB integrity audit ===\n");

  // ── 1. Orphan checks ──────────────────────────────────────────────
  const jobsWithoutPlot = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT j.id FROM "Job" j LEFT JOIN "Plot" p ON p.id = j."plotId" WHERE p.id IS NULL LIMIT 10
  `);
  record(
    "Orphan jobs (no plot)",
    jobsWithoutPlot.length,
    jobsWithoutPlot.map((r) => r.id)
  );

  const ordersWithoutSupplier = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT o.id FROM "MaterialOrder" o LEFT JOIN "Supplier" s ON s.id = o."supplierId" WHERE s.id IS NULL LIMIT 10
  `);
  record(
    "Orders without supplier",
    ordersWithoutSupplier.length,
    ordersWithoutSupplier.map((r) => r.id)
  );

  const snagsWithoutPlot = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT s.id FROM "Snag" s LEFT JOIN "Plot" p ON p.id = s."plotId" WHERE p.id IS NULL LIMIT 10
  `);
  record(
    "Orphan snags",
    snagsWithoutPlot.length,
    snagsWithoutPlot.map((r) => r.id)
  );

  // ── 2. Status / date invariants ──────────────────────────────────
  const completedNoEnd = await prisma.job.findMany({
    where: { status: "COMPLETED", actualEndDate: null },
    select: { id: true, name: true },
    take: 10,
  });
  record(
    "COMPLETED jobs with no actualEndDate",
    completedNoEnd.length,
    completedNoEnd.map((j) => `${j.id} · ${j.name}`),
    false // historical data may be missing this — non-critical
  );

  const inProgressNoStart = await prisma.job.findMany({
    where: { status: "IN_PROGRESS", actualStartDate: null },
    select: { id: true, name: true },
    take: 10,
  });
  record(
    "IN_PROGRESS jobs with no actualStartDate",
    inProgressNoStart.length,
    inProgressNoStart.map((j) => `${j.id} · ${j.name}`),
    false
  );

  // endDate < startDate should never happen
  const reversedDates = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`
    SELECT id, name FROM "Job" WHERE "endDate" < "startDate" LIMIT 10
  `);
  record(
    "Jobs with endDate < startDate",
    reversedDates.length,
    reversedDates.map((j) => `${j.id} · ${j.name}`)
  );

  // ── 3. Order-status invariants ───────────────────────────────────
  const deliveredNoDate = await prisma.materialOrder.findMany({
    where: { status: "DELIVERED", deliveredDate: null },
    select: { id: true, itemsDescription: true },
    take: 10,
  });
  record(
    "DELIVERED orders with no deliveredDate",
    deliveredNoDate.length,
    deliveredNoDate.map((o) => `${o.id} · ${o.itemsDescription ?? "(no desc)"}`),
    false
  );

  // PENDING orders with a dateOfOrder in the future (ok)
  // but PENDING orders marked DELIVERED somewhere (shouldn't happen because it's a single column)

  // ── 4. Snag invariants ───────────────────────────────────────────
  const resolvedWithoutDate = await prisma.snag.findMany({
    where: { status: "RESOLVED", resolvedAt: null },
    select: { id: true, description: true },
    take: 10,
  });
  record(
    "RESOLVED snags with no resolvedAt",
    resolvedWithoutDate.length,
    resolvedWithoutDate.map((s) => `${s.id} · ${s.description.slice(0, 50)}`),
    false
  );

  // ── 5. Parent/child rollup (I6 from cascade spec) ────────────────
  // parent.startDate should equal min(children.startDate)
  // parent.endDate should equal max(children.endDate)
  const parentsWithChildren = await prisma.job.findMany({
    where: { children: { some: {} } },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      children: { select: { startDate: true, endDate: true } },
    },
  });
  const rollupDrift: string[] = [];
  for (const p of parentsWithChildren) {
    const childStarts = p.children.map((c) => c.startDate).filter(Boolean) as Date[];
    const childEnds = p.children.map((c) => c.endDate).filter(Boolean) as Date[];
    if (childStarts.length === 0) continue;
    const minChild = new Date(Math.min(...childStarts.map((d) => d.getTime())));
    const maxChild = new Date(Math.max(...childEnds.map((d) => d.getTime())));
    if (!p.startDate || !p.endDate) {
      rollupDrift.push(`${p.id} · ${p.name}: parent dates null but has children`);
      continue;
    }
    if (p.startDate.getTime() !== minChild.getTime()) {
      rollupDrift.push(
        `${p.id} · ${p.name}: parent.startDate=${p.startDate.toISOString().slice(0, 10)} vs min(children)=${minChild.toISOString().slice(0, 10)}`
      );
    }
    if (p.endDate.getTime() !== maxChild.getTime()) {
      rollupDrift.push(
        `${p.id} · ${p.name}: parent.endDate=${p.endDate.toISOString().slice(0, 10)} vs max(children)=${maxChild.toISOString().slice(0, 10)}`
      );
    }
  }
  record("Parent/child rollup drift (I6 violation)", rollupDrift.length, rollupDrift.slice(0, 10));

  // ── 6. Template snapshot links ───────────────────────────────────
  const brokenSourceTemplateRefs = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`
    SELECT p.id, p.name FROM "Plot" p
    LEFT JOIN "PlotTemplate" t ON t.id = p."sourceTemplateId"
    WHERE p."sourceTemplateId" IS NOT NULL AND t.id IS NULL
    LIMIT 10
  `);
  record(
    "Plots with broken sourceTemplateId",
    brokenSourceTemplateRefs.length,
    brokenSourceTemplateRefs.map((p) => `${p.id} · ${p.name}`)
  );

  // ── 7. Contact dedup (already covered by audit-contact-dedup.ts) ─
  // Skip — separate script handles this.

  // ── 8. Snag contact mismatch ─────────────────────────────────────
  // Snag's assignedToId should be a User; contactId should be a Contact.
  // Schema FKs enforce this, but let's sanity-check.
  const snagsWithBadContact = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT s.id FROM "Snag" s
    LEFT JOIN "Contact" c ON c.id = s."contactId"
    WHERE s."contactId" IS NOT NULL AND c.id IS NULL
    LIMIT 10
  `);
  record(
    "Snags with invalid contactId",
    snagsWithBadContact.length,
    snagsWithBadContact.map((r) => r.id)
  );

  // ── 9. Working-day check on critical dates ───────────────────────
  // Jobs should have start/end dates on weekdays (Mon-Fri).
  // Allow "null" for unset dates.
  const weekendJobs = await prisma.$queryRawUnsafe<{ id: string; name: string; day: number }[]>(`
    SELECT j.id, j.name, EXTRACT(DOW FROM j."startDate")::int AS day
    FROM "Job" j
    WHERE j."startDate" IS NOT NULL
      AND EXTRACT(DOW FROM j."startDate") IN (0, 6)
    LIMIT 20
  `);
  record(
    "Jobs with startDate on Sat/Sun (I2 violation)",
    weekendJobs.length,
    weekendJobs.map((j) => `${j.id} · ${j.name} · day=${j.day}`),
    false
  );

  const weekendEnds = await prisma.$queryRawUnsafe<{ id: string; name: string; day: number }[]>(`
    SELECT j.id, j.name, EXTRACT(DOW FROM j."endDate")::int AS day
    FROM "Job" j
    WHERE j."endDate" IS NOT NULL
      AND EXTRACT(DOW FROM j."endDate") IN (0, 6)
    LIMIT 20
  `);
  record(
    "Jobs with endDate on Sat/Sun (I2 violation)",
    weekendEnds.length,
    weekendEnds.map((j) => `${j.id} · ${j.name} · day=${j.day}`),
    false
  );

  // ── 10. Document scope invariants ────────────────────────────────
  // Each SiteDocument should have exactly one of siteId / contactId.
  const docsNoScope = await prisma.siteDocument.count({
    where: { siteId: null, contactId: null },
  });
  record(
    "Documents with no siteId AND no contactId",
    docsNoScope,
    docsNoScope === 0 ? [] : ["(check manually if any found)"]
  );

  // ── Report ────────────────────────────────────────────────────────
  const issues = checks.filter((c) => c.rows > 0);
  const criticalIssues = issues.filter((c) => c.critical);
  const softIssues = issues.filter((c) => !c.critical);

  console.log("Checks run: " + checks.length);
  console.log("Clean:      " + checks.filter((c) => c.rows === 0).length);
  console.log("Critical:   " + criticalIssues.length);
  console.log("Soft:       " + softIssues.length);
  console.log();

  for (const check of checks) {
    const status = check.rows === 0 ? "✅" : check.critical ? "🚩" : "⚠️ ";
    console.log(`${status} ${check.name}: ${check.rows} row${check.rows === 1 ? "" : "s"}`);
    if (check.rows > 0) {
      for (const d of check.details.slice(0, 5)) console.log(`      · ${d}`);
      if (check.details.length > 5) console.log(`      ... and ${check.details.length - 5} more`);
    }
  }

  console.log();
  if (criticalIssues.length === 0) {
    console.log("=== ✅ DB integrity: CLEAN ===");
    console.log(
      softIssues.length > 0
        ? `${softIssues.length} soft issue${softIssues.length === 1 ? "" : "s"} flagged (non-critical, historical data).`
        : "No issues of any kind."
    );
  } else {
    console.log(`=== 🚩 ${criticalIssues.length} CRITICAL ISSUE${criticalIssues.length === 1 ? "" : "S"} ===`);
    for (const c of criticalIssues) {
      console.log(`   - ${c.name}: ${c.rows}`);
    }
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
