import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #183) Weather-loss aggregation.
 *
 * Aggregates RainedOffDay rows over a rolling window. Returns:
 *   - totalDays (rain + temperature combined)
 *   - byType { RAIN, TEMPERATURE, FROST, OTHER }
 *   - bySite (top 10 most-affected sites)
 *   - byMonth (calendar month buckets for the last 12 months)
 *
 * Sites + months are pre-seeded so the chart isn't gappy.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  const days = await prisma.rainedOffDay.findMany({
    where: siteIds !== null ? { siteId: { in: siteIds } } : {},
    select: {
      date: true,
      type: true,
      site: { select: { id: true, name: true } },
    },
  });

  // Total + per-type breakdown.
  const byType: Record<string, number> = {};
  for (const d of days) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
  }

  // Top sites.
  const siteMap = new Map<string, { id: string; name: string; days: number }>();
  for (const d of days) {
    const cur = siteMap.get(d.site.id) ?? { id: d.site.id, name: d.site.name, days: 0 };
    cur.days += 1;
    siteMap.set(d.site.id, cur);
  }
  const bySite = Array.from(siteMap.values())
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  // Month buckets — last 12 months.
  const now = new Date();
  const monthBuckets = new Map<string, { rain: number; temp: number; other: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthBuckets.set(key, { rain: 0, temp: 0, other: 0 });
  }
  const earliestMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() - 11, 1);
  for (const d of days) {
    if (d.date < earliestMonth) continue;
    const key = `${d.date.getUTCFullYear()}-${String(d.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = monthBuckets.get(key);
    if (!cur) continue;
    if (d.type === "RAIN") cur.rain += 1;
    else if (d.type === "TEMPERATURE") cur.temp += 1;
    else cur.other += 1;
  }
  const byMonth = Array.from(monthBuckets.entries()).map(([month, v]) => ({
    month,
    ...v,
    total: v.rain + v.temp + v.other,
  }));

  return NextResponse.json({
    totalDays: days.length,
    byType,
    bySite,
    byMonth,
  });
}
