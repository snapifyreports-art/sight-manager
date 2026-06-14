import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * (Jun 2026 SSoT/cascade audit) Compute a sortOrder for a manually-added
 * job so it slots into the plot's existing schedule order.
 *
 * Why this exists: template-applied jobs get meaningful positive
 * sortOrders (stage*100 → 100, 200, 300…), but a manual "Add job" used to
 * leave sortOrder at its schema default of 0. Zero sorts BEFORE every
 * template stage, and the cascade engine, "next stage ready" detection,
 * and the weather (rained-off) shift all scope downstream work by
 * sortOrder. A manual job pinned at 0 was therefore either skipped when an
 * earlier stage slipped (it never moved with the chain) or dragged the
 * whole plot when IT moved (everything had a higher sortOrder). See
 * cascade.ts:`j.sortOrder > trigger.sortOrder`.
 *
 * Fix: place the new job in the plot's date order. It inherits a sortOrder
 * just above the latest job that starts on/before it, so sortOrder stays
 * monotonic with the dates the manager typed — which is exactly what the
 * sortOrder-keyed flows assume. Fallbacks:
 *  - no jobs yet on the plot → 100 (matches the first template stage),
 *  - no start date on the new job → append after everything (max + 100),
 *    so an unscheduled job never sorts ahead of real stages,
 *  - new job starts before every existing job → min − 1 (sorts first).
 */
export async function computeJobSortOrder(
  client: PrismaClient | Prisma.TransactionClient,
  plotId: string,
  startDate: Date | null,
): Promise<number> {
  const siblings = await client.job.findMany({
    where: { plotId },
    select: { sortOrder: true, startDate: true },
  });
  if (siblings.length === 0) return 100;

  const maxSort = Math.max(...siblings.map((j) => j.sortOrder));
  if (!startDate) return maxSort + 100;

  const t = startDate.getTime();
  const before = siblings.filter(
    (j) => j.startDate != null && j.startDate.getTime() <= t,
  );
  if (before.length === 0) {
    const minSort = Math.min(...siblings.map((j) => j.sortOrder));
    return minSort - 1;
  }
  return Math.max(...before.map((j) => j.sortOrder)) + 1;
}
