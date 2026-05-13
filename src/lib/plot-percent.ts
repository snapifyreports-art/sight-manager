import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Recompute Plot.buildCompletePercent from its leaf jobs.
 *
 * Single source of truth — every Job mutation that could change
 * status counts MUST call this so the cached percent on the Plot
 * row never drifts. May 2026 audit found 7+ mutation sites that
 * were skipping the recompute (delete, pull-forward, restart-decision,
 * delay, bulk-delay, manual PUT, etc.). Centralising here means a
 * single grep for "recomputePlotPercent" tells you every code path
 * that keeps the cache fresh.
 *
 * Leaf jobs only (children: { none: {} }) — parent stages are
 * rollup containers that double-count if mixed in with their
 * children.
 *
 * Accepts either a transaction client or the regular prisma — keeps
 * call sites simple (`recomputePlotPercent(tx, plotId)` works the
 * same as `recomputePlotPercent(prisma, plotId)`).
 */
export async function recomputePlotPercent(
  client: PrismaClient | Prisma.TransactionClient,
  plotId: string,
): Promise<number> {
  const counts = await client.job.groupBy({
    by: ["status"],
    where: { plotId, children: { none: {} } },
    _count: true,
  });

  let total = 0;
  let completed = 0;
  for (const c of counts) {
    total += c._count;
    if (c.status === "COMPLETED") completed += c._count;
  }

  const percent = total === 0 ? 0 : (completed / total) * 100;

  await client.plot.update({
    where: { id: plotId },
    data: { buildCompletePercent: percent },
  });

  // (May 2026 audit P-P0-9) Return the new percent so reconcile + other
  // drift-detection callers don't have to issue a second findUnique just
  // to read what we already computed. Existing void-returning consumers
  // can ignore the value — TS allows discarding a return.
  return percent;
}
