import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (Jun 2026) Quality & compliance analytics — the flagship QA roll-up.
 *
 * Aggregates five quality models across the user's accessible sites:
 *   - Inspection (plot-scoped): first-time pass rate, open count, by-type table
 *   - NCR (site-scoped): open count + avg calendar days open, by-status counts
 *   - Snag (plot-scoped): open count + avg resolution days, open-by-priority
 *   - DefectReport (plot-scoped): open count
 *   - SiteComplianceItem (site-scoped): expired + expiring-soon counts
 *
 * Scope: getUserSiteIds returns null for admin/all-sites (no filter), or an
 * array to filter on. Plot-scoped models filter via the plot relation's
 * siteId; site-scoped models filter on siteId directly.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "VIEW_ANALYTICS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  // Scope filters. Plot-scoped models reach the site via the plot relation;
  // site-scoped models carry siteId directly. `null` = admin/all sites.
  const plotScope =
    siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};
  const siteScope = siteIds !== null ? { siteId: { in: siteIds } } : {};

  const now = new Date();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const soonCutoff = new Date(now.getTime() + 30 * MS_PER_DAY);

  const [inspections, ncrs, snags, defects, compliance] = await Promise.all([
    prisma.inspection.findMany({
      where: plotScope,
      select: { status: true, type: true },
    }),
    prisma.nCR.findMany({
      where: siteScope,
      select: { status: true, raisedAt: true, closedAt: true },
    }),
    prisma.snag.findMany({
      where: plotScope,
      select: {
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
    prisma.defectReport.findMany({
      where: plotScope,
      select: { status: true },
    }),
    prisma.siteComplianceItem.findMany({
      where: siteScope,
      select: { status: true, expiresAt: true },
    }),
  ]);

  // ── Inspections ──────────────────────────────────────────────────────
  // First-time pass rate = PASSED / (PASSED + FAILED). Open = SCHEDULED,
  // BOOKED, OVERDUE. Per-type table carries total + passed count.
  let passed = 0;
  let failed = 0;
  let openInspections = 0;
  const typeMap = new Map<string, { total: number; passed: number }>();
  for (const i of inspections) {
    if (i.status === "PASSED") passed += 1;
    else if (i.status === "FAILED") failed += 1;
    if (
      i.status === "SCHEDULED" ||
      i.status === "BOOKED" ||
      i.status === "OVERDUE"
    ) {
      openInspections += 1;
    }
    const t = typeMap.get(i.type) ?? { total: 0, passed: 0 };
    t.total += 1;
    if (i.status === "PASSED") t.passed += 1;
    typeMap.set(i.type, t);
  }
  const firstTimePassRate =
    passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null;
  const inspectionsByType = Array.from(typeMap.entries())
    .map(([type, v]) => ({ type, total: v.total, passed: v.passed }))
    .sort((a, b) => b.total - a.total);

  // ── NCRs ─────────────────────────────────────────────────────────────
  // Open = status not in (RESOLVED, CLOSED). Avg days open = calendar days
  // (closed rows use closedAt - raisedAt; open rows use now - raisedAt).
  let openNcrs = 0;
  let ncrDaysSum = 0;
  const ncrByStatus: Record<string, number> = {};
  for (const n of ncrs) {
    ncrByStatus[n.status] = (ncrByStatus[n.status] ?? 0) + 1;
    if (n.status !== "RESOLVED" && n.status !== "CLOSED") openNcrs += 1;
    const end = n.closedAt ?? now;
    ncrDaysSum += Math.max(0, (end.getTime() - n.raisedAt.getTime()) / MS_PER_DAY);
  }
  const ncrAvgDaysOpen =
    ncrs.length > 0 ? Math.round(ncrDaysSum / ncrs.length) : null;

  // ── Snags ────────────────────────────────────────────────────────────
  // Open = OPEN or IN_PROGRESS. Avg resolution days from resolved rows only.
  // Open-by-priority feeds the mini-row.
  let openSnags = 0;
  let snagResSum = 0;
  let snagResCount = 0;
  const openSnagByPriority: Record<string, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const s of snags) {
    const isOpen = s.status === "OPEN" || s.status === "IN_PROGRESS";
    if (isOpen) {
      openSnags += 1;
      if (s.priority in openSnagByPriority) {
        openSnagByPriority[s.priority] += 1;
      }
    }
    if (s.resolvedAt) {
      snagResSum += Math.max(
        0,
        (s.resolvedAt.getTime() - s.createdAt.getTime()) / MS_PER_DAY,
      );
      snagResCount += 1;
    }
  }
  const snagAvgResolutionDays =
    snagResCount > 0 ? Math.round(snagResSum / snagResCount) : null;

  // ── Defects ──────────────────────────────────────────────────────────
  // Open = status not in (RESOLVED, CLOSED).
  let openDefects = 0;
  for (const d of defects) {
    if (d.status !== "RESOLVED" && d.status !== "CLOSED") openDefects += 1;
  }

  // ── Compliance ───────────────────────────────────────────────────────
  // Expired = status EXPIRED OR (expiresAt set and in the past).
  // Expiring soon = expiresAt within the next 30 days and not yet expired.
  let complianceExpired = 0;
  let complianceExpiringSoon = 0;
  for (const c of compliance) {
    const isExpired =
      c.status === "EXPIRED" || (c.expiresAt != null && c.expiresAt < now);
    if (isExpired) {
      complianceExpired += 1;
    } else if (
      c.expiresAt != null &&
      c.expiresAt >= now &&
      c.expiresAt <= soonCutoff
    ) {
      complianceExpiringSoon += 1;
    }
  }

  // Portfolio is empty when every quality model has zero rows — the widget
  // renders nothing in that case (clean empty-install experience).
  const hasData =
    inspections.length > 0 ||
    ncrs.length > 0 ||
    snags.length > 0 ||
    defects.length > 0 ||
    compliance.length > 0;

  return NextResponse.json({
    hasData,
    inspections: {
      firstTimePassRate,
      passed,
      failed,
      open: openInspections,
      byType: inspectionsByType,
    },
    ncrs: {
      open: openNcrs,
      avgDaysOpen: ncrAvgDaysOpen,
      byStatus: ncrByStatus,
      total: ncrs.length,
    },
    snags: {
      open: openSnags,
      avgResolutionDays: snagAvgResolutionDays,
      openByPriority: openSnagByPriority,
    },
    defects: {
      open: openDefects,
    },
    compliance: {
      expired: complianceExpired,
      expiringSoon: complianceExpiringSoon,
    },
  });
}
