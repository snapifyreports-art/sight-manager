import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/lateness
 *
 * Cross-site lateness rollup. Returns:
 *   - byReason: total working days lost per reason
 *   - bySite: per-site lateness leaderboard (open vs resolved totals)
 *   - byContractor: top contractors with attributed lateness
 *   - totals: open count, resolved count, total WD lost
 */
export async function GET(req: NextRequest) {
  void req;
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteIds = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);

  const where: Record<string, unknown> = {};
  if (siteIds !== null) where.siteId = { in: siteIds };

  const events = await prisma.latenessEvent.findMany({
    where,
    select: {
      id: true,
      kind: true,
      siteId: true,
      daysLate: true,
      resolvedAt: true,
      reasonCode: true,
      attributedContactId: true,
      attributedContact: { select: { id: true, name: true, company: true } },
      site: { select: { id: true, name: true } },
    },
  });

  // by reason
  const reasonMap = new Map<string, { reason: string; openDays: number; resolvedDays: number; count: number }>();
  for (const e of events) {
    const r = reasonMap.get(e.reasonCode) ?? { reason: e.reasonCode, openDays: 0, resolvedDays: 0, count: 0 };
    r.count++;
    if (e.resolvedAt) r.resolvedDays += e.daysLate;
    else r.openDays += e.daysLate;
    reasonMap.set(e.reasonCode, r);
  }
  const byReason = Array.from(reasonMap.values()).sort((a, b) => (b.openDays + b.resolvedDays) - (a.openDays + a.resolvedDays));

  // by site
  const siteMap = new Map<string, { siteId: string; siteName: string; openCount: number; openDays: number; resolvedCount: number; resolvedDays: number }>();
  for (const e of events) {
    const key = e.siteId;
    const r = siteMap.get(key) ?? {
      siteId: e.siteId,
      siteName: e.site.name,
      openCount: 0,
      openDays: 0,
      resolvedCount: 0,
      resolvedDays: 0,
    };
    if (e.resolvedAt) {
      r.resolvedCount++;
      r.resolvedDays += e.daysLate;
    } else {
      r.openCount++;
      r.openDays += e.daysLate;
    }
    siteMap.set(key, r);
  }
  const bySite = Array.from(siteMap.values()).sort((a, b) => (b.openDays + b.resolvedDays) - (a.openDays + a.resolvedDays));

  // by contractor (only events with attribution)
  const contractorMap = new Map<string, { contactId: string; name: string; company: string | null; count: number; days: number }>();
  for (const e of events) {
    if (!e.attributedContactId || !e.attributedContact) continue;
    const key = e.attributedContactId;
    const r = contractorMap.get(key) ?? {
      contactId: e.attributedContactId,
      name: e.attributedContact.name,
      company: e.attributedContact.company,
      count: 0,
      days: 0,
    };
    r.count++;
    r.days += e.daysLate;
    contractorMap.set(key, r);
  }
  const byContractor = Array.from(contractorMap.values()).sort((a, b) => b.days - a.days).slice(0, 10);

  const openTotals = events.filter((e) => !e.resolvedAt);
  const resolvedTotals = events.filter((e) => e.resolvedAt);
  const totals = {
    openCount: openTotals.length,
    openDays: openTotals.reduce((s, e) => s + e.daysLate, 0),
    resolvedCount: resolvedTotals.length,
    resolvedDays: resolvedTotals.reduce((s, e) => s + e.daysLate, 0),
  };

  return NextResponse.json({ byReason, bySite, byContractor, totals });
}
