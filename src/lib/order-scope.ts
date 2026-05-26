import type { Prisma } from "@prisma/client";

/**
 * (May 2026 SSoT pass) Canonical "this order belongs to this site"
 * predicate. MaterialOrder can be attached three ways (schema:489-509):
 *
 *   1. via a Job → its Plot → its Site (the common case, template orders)
 *   2. directly to a Plot (`plotId` set, no job — plot-level one-offs)
 *   3. directly to a Site (`siteId` set, no plot or job — site-level one-offs)
 *
 * Pre-this-helper, every site-scoped order query reinvented the predicate
 * and quietly disagreed:
 *   - Weekly Report counted only (1) — silently dropped both kinds of one-offs.
 *   - Supplier Analysis counted (1) + (3) — missed plot-level one-offs.
 *   - Material Burndown counted only (1) — same bug as Weekly Report.
 *
 * Use this helper anywhere you need "orders for site X." Pass extra
 * constraints (status, dates, etc.) as additional fields on the surrounding
 * `where` object — the OR here only covers attachment.
 */
export function whereOrdersForSite(siteId: string): Prisma.MaterialOrderWhereInput {
  return {
    OR: [
      { job: { plot: { siteId } } },
      { plot: { siteId } },
      { siteId },
    ],
  };
}
