import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (Jun 2026) Activity-by-event-type aggregation.
 *
 * Counts EventLog rows over a rolling 90-day window, grouped by the
 * EventType enum. Returns:
 *   - total      (all matching events in window)
 *   - byType     ({ type, count }[] sorted count desc)
 *   - windowDays (90)
 *
 * Scope: admin/all-sites (siteIds === null) sees every site; otherwise
 * filtered to the caller's accessible siteIds. Note EventLog.siteId is
 * nullable (system events) — those only surface for the all-sites view.
 */
const WINDOW_DAYS = 90;

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

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // groupBy type with _count — single aggregate query, no in-memory reduce.
  const grouped = await prisma.eventLog.groupBy({
    by: ["type"],
    where: {
      createdAt: { gte: since },
      ...(siteIds !== null ? { siteId: { in: siteIds } } : {}),
    },
    _count: { _all: true },
  });

  const byType = grouped
    .map((g) => ({ type: g.type as string, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const total = byType.reduce((sum, t) => sum + t.count, 0);

  return NextResponse.json({ total, byType, windowDays: WINDOW_DAYS });
}
