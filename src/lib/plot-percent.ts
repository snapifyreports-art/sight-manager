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

/**
 * The site-level "% complete" headline — the SINGLE definition used
 * everywhere a site's overall progress is shown.
 *
 * (Jun 2026 SSoT audit + Keith decision) Plot-weighted: the average of
 * each plot's own buildCompletePercent, so every plot/house counts
 * equally regardless of how many jobs it has. This is "average house
 * completion", which is what a site manager expects as the headline.
 *
 * Pre-fix the Daily Brief + weekly email instead used completed-jobs /
 * total-jobs (job-weighted, so a 30-job plot dominated a 1-job plot),
 * while the Site Story, Closure, handover PDF and Portfolio already used
 * this plot-weighted average — so the same site could read 10% on the
 * Brief and 50% on the handover pack. Routing all of them through this
 * one function means the headline can never contradict the handover pack
 * again. A null percent counts as 0 (an un-recomputed plot reads as
 * not-started, never silently dropped). Caller rounds for display.
 */
export function averagePlotCompletePercent(
  plots: Array<{ buildCompletePercent: number | null }>,
): number {
  if (plots.length === 0) return 0;
  const sum = plots.reduce((s, p) => s + (p.buildCompletePercent ?? 0), 0);
  return sum / plots.length;
}
