/**
 * (#180) One-shot: surface (and optionally repair) snags with
 * `status = "CLOSED"` but `resolvedAt = null`. Pre-#180 the snag
 * status flip didn't set resolvedAt when going directly OPEN → CLOSED
 * (bypassing the RESOLVED state), so reports that derive "how long
 * was this snag open?" from resolvedAt missed these rows entirely.
 *
 * Default REPORT — pass `--repair` to set resolvedAt = updatedAt on
 * each (the closest stamp we have for "when was this snag closed").
 *
 *   npx tsx scripts/backfill-closed-snag-resolved-at.ts          # report only
 *   npx tsx scripts/backfill-closed-snag-resolved-at.ts --repair # actually update
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REPAIR = process.argv.includes("--repair");

async function main() {
  const suspects = await prisma.snag.findMany({
    where: {
      status: "CLOSED",
      resolvedAt: null,
    },
    select: {
      id: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      plot: { select: { plotNumber: true, name: true, site: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "asc" },
  });

  if (suspects.length === 0) {
    console.log("No CLOSED snags with null resolvedAt — all clean.");
    return;
  }

  console.log(`Found ${suspects.length} CLOSED snags with null resolvedAt:\n`);
  for (const s of suspects) {
    const plot = s.plot;
    const plotLabel = plot?.plotNumber ? `Plot ${plot.plotNumber}` : plot?.name ?? "—";
    console.log(
      `  [${s.id.slice(0, 8)}] ${plot?.site.name ?? "—"} · ${plotLabel} · closed ${s.updatedAt.toISOString().slice(0, 10)} · "${s.description.slice(0, 60)}"`,
    );
  }

  if (!REPAIR) {
    console.log("\nReport-only. Re-run with --repair to set resolvedAt = updatedAt on each.");
    return;
  }

  console.log("\nApplying repair…");
  for (const s of suspects) {
    await prisma.snag.update({
      where: { id: s.id },
      data: { resolvedAt: s.updatedAt },
    });
  }
  console.log(`Repaired ${suspects.length} snags.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
