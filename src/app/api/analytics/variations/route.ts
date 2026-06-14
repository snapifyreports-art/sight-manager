import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (Jun 2026) Variations-impact aggregation.
 *
 * Variations are plot-scoped, so portfolio access is filtered via
 * plot.siteId. Returns:
 *   - countByStatus { REQUESTED, APPROVED, REJECTED, IMPLEMENTED }
 *   - totalCostAdded  (sum costDelta where status APPROVED|IMPLEMENTED, nulls ignored)
 *   - totalDaysAdded  (sum daysDelta where status APPROVED|IMPLEMENTED, nulls ignored)
 *   - approvedCount   (APPROVED + IMPLEMENTED — i.e. anything that "counts")
 *   - pendingCount    (REQUESTED, awaiting a decision)
 *   - bySite          (top 8 sites by summed approved/implemented costDelta)
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (Jun 2026 hardening) Analytics route — gate on VIEW_ANALYTICS.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "VIEW_ANALYTICS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  // siteIds === null means admin/all sites: no filter. Otherwise scope on
  // the plot's site (variations are plot-scoped).
  const variations = await prisma.variation.findMany({
    where:
      siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {},
    select: {
      status: true,
      costDelta: true,
      daysDelta: true,
      plot: { select: { site: { select: { id: true, name: true } } } },
    },
  });

  // Counts by status (pre-seed every enum value so the shape is stable).
  const countByStatus: Record<string, number> = {
    REQUESTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    IMPLEMENTED: 0,
  };

  // A variation only "lands" (adds cost/days) once approved or implemented.
  const COUNTS = new Set(["APPROVED", "IMPLEMENTED"]);

  let totalCostAdded = 0;
  let totalDaysAdded = 0;

  // Per-site tallies of landed cost/days/count.
  const siteMap = new Map<
    string,
    { siteName: string; cost: number; days: number; count: number }
  >();

  for (const v of variations) {
    countByStatus[v.status] = (countByStatus[v.status] ?? 0) + 1;
    if (!COUNTS.has(v.status)) continue;

    const cost = v.costDelta ?? 0;
    const days = v.daysDelta ?? 0;
    totalCostAdded += cost;
    totalDaysAdded += days;

    const site = v.plot.site;
    const cur =
      siteMap.get(site.id) ?? {
        siteName: site.name,
        cost: 0,
        days: 0,
        count: 0,
      };
    cur.cost += cost;
    cur.days += days;
    cur.count += 1;
    siteMap.set(site.id, cur);
  }

  const approvedCount = countByStatus.APPROVED + countByStatus.IMPLEMENTED;
  const pendingCount = countByStatus.REQUESTED;

  const bySite = Array.from(siteMap.values())
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);

  return NextResponse.json({
    total: variations.length,
    countByStatus,
    totalCostAdded,
    totalDaysAdded,
    approvedCount,
    pendingCount,
    bySite,
  });
}
