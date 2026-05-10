import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #182) Delay trends — week-by-week count of
 * SCHEDULE_CASCADED events grouped by delayReasonType.
 *
 * Last 12 weeks (configurable via ?weeks=N). Returns per-week
 * buckets with reason breakdown so the UI can render a stacked
 * bar chart and identify whether weather, supplier issues, or
 * something else is the dominant delay source.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  const url = new URL(req.url);
  const weeks = Math.min(
    Math.max(Number(url.searchParams.get("weeks") ?? "12") || 12, 1),
    52,
  );
  const start = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  const events = await prisma.eventLog.findMany({
    where: {
      type: "SCHEDULE_CASCADED",
      createdAt: { gte: start },
      delayReasonType: { not: null },
      ...(siteIds !== null ? { siteId: { in: siteIds } } : {}),
    },
    select: { createdAt: true, delayReasonType: true, siteId: true },
  });

  // Bucket key: ISO week start (Monday). Floor each createdAt.
  function isoWeekStart(d: Date): string {
    const day = (d.getUTCDay() + 6) % 7; // 0 = Mon
    const mon = new Date(d);
    mon.setUTCDate(mon.getUTCDate() - day);
    mon.setUTCHours(0, 0, 0, 0);
    return mon.toISOString().slice(0, 10);
  }

  const buckets = new Map<string, Record<string, number>>();
  // Pre-seed every week in the range so the chart isn't gappy.
  for (let i = 0; i < weeks; i++) {
    const ts = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    buckets.set(isoWeekStart(ts), {});
  }

  for (const ev of events) {
    const w = isoWeekStart(ev.createdAt);
    const reason = ev.delayReasonType ?? "OTHER";
    const cur = buckets.get(w) ?? {};
    cur[reason] = (cur[reason] ?? 0) + 1;
    buckets.set(w, cur);
  }

  const series = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, reasons]) => ({
      weekStart,
      total: Object.values(reasons).reduce((s, n) => s + n, 0),
      reasons,
    }));

  // Top reason rollup across the window.
  const reasonTotals: Record<string, number> = {};
  for (const ev of events) {
    const r = ev.delayReasonType ?? "OTHER";
    reasonTotals[r] = (reasonTotals[r] ?? 0) + 1;
  }
  const topReasons = Object.entries(reasonTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));

  return NextResponse.json({
    weeks,
    series,
    topReasons,
    totalEvents: events.length,
  });
}
