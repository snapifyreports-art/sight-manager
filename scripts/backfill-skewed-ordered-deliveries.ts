/**
 * (#176) One-shot: surface (and optionally repair) ORDERED orders whose
 * `expectedDeliveryDate` is in the past and whose dateOfOrder is also
 * in the past. These are most likely victims of the pre-#176 cascade
 * engine, which used to silently shift ORDERED orders backwards as
 * part of a pull-forward.
 *
 * Default mode is REPORT — list the suspicious orders, do nothing.
 * Pass `--repair` to set their expectedDeliveryDate to today (so they
 * fall out of Daily Brief overdue immediately; the manager can then
 * confirm or update each one). Idempotent; safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-skewed-ordered-deliveries.ts          # report only
 *   npx tsx scripts/backfill-skewed-ordered-deliveries.ts --repair # actually update
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REPAIR = process.argv.includes("--repair");

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const suspects = await prisma.materialOrder.findMany({
    where: {
      status: "ORDERED",
      expectedDeliveryDate: { lt: today },
    },
    select: {
      id: true,
      dateOfOrder: true,
      expectedDeliveryDate: true,
      supplier: { select: { name: true } },
      job: { select: { name: true, plot: { select: { plotNumber: true, name: true, site: { select: { name: true } } } } } },
    },
    orderBy: { expectedDeliveryDate: "asc" },
  });

  if (suspects.length === 0) {
    console.log("No ORDERED orders with past expectedDeliveryDate found.");
    return;
  }

  console.log(`Found ${suspects.length} ORDERED orders with expectedDeliveryDate < today:\n`);
  for (const o of suspects) {
    const plot = o.job?.plot;
    const plotLabel = plot?.plotNumber ? `Plot ${plot.plotNumber}` : plot?.name ?? "—";
    console.log(
      `  [${o.id.slice(0, 8)}] ${o.supplier.name} — ${o.job?.name ?? "(no job)"} · ${plotLabel} · ${plot?.site.name ?? "(no site)"} · was due ${o.expectedDeliveryDate?.toISOString().slice(0, 10)}`,
    );
  }

  if (!REPAIR) {
    console.log("\nReport-only. Re-run with --repair to set expectedDeliveryDate = today on each.");
    return;
  }

  console.log("\nApplying repair (expectedDeliveryDate = today)…");
  let done = 0;
  for (const o of suspects) {
    await prisma.materialOrder.update({
      where: { id: o.id },
      data: { expectedDeliveryDate: today },
    });
    done++;
  }
  console.log(`Repaired ${done} orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
