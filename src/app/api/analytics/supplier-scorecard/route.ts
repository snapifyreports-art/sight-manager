import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (Jun 2026) Supplier scorecard — reliability beyond spend.
 *
 * For each supplier with non-cancelled, job-linked orders in the caller's
 * site scope, we surface delivery reliability alongside spend:
 *   - orderCount / spend (sum of orderItems.totalCost)
 *   - onTimeRate — DELIVERED orders that arrived on/before the expected
 *     date, over the subset that had both dates set (null when none)
 *   - avgLeadDays — mean calendar days from order to delivery (null when
 *     none delivered)
 *   - attributedDaysLate — working days of lateness pinned on this
 *     supplier by the lateness cron (un-excused LatenessEvents)
 *
 * Orders are scoped by job.plot.siteId, mirroring the main analytics
 * route. Returns the top 15 suppliers by spend, descending.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface SupplierAgg {
  id: string;
  name: string;
  orderCount: number;
  spend: number;
  deliveriesWithExpected: number;
  onTime: number;
  leadDaysSum: number;
  deliveredCount: number;
  attributedDaysLate: number;
}

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

  // Job-linked orders scoped by job.plot.siteId. siteIds === null means
  // admin/all sites → no site filter.
  const orders = await prisma.materialOrder.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(siteIds !== null
        ? { job: { is: { plot: { siteId: { in: siteIds } } } } }
        : {}),
    },
    select: {
      status: true,
      dateOfOrder: true,
      expectedDeliveryDate: true,
      deliveredDate: true,
      supplier: { select: { id: true, name: true } },
      orderItems: { select: { totalCost: true } },
    },
  });

  const bySupplier = new Map<string, SupplierAgg>();
  const get = (id: string, name: string): SupplierAgg => {
    let agg = bySupplier.get(id);
    if (!agg) {
      agg = {
        id,
        name,
        orderCount: 0,
        spend: 0,
        deliveriesWithExpected: 0,
        onTime: 0,
        leadDaysSum: 0,
        deliveredCount: 0,
        attributedDaysLate: 0,
      };
      bySupplier.set(id, agg);
    }
    return agg;
  };

  for (const o of orders) {
    const agg = get(o.supplier.id, o.supplier.name);
    agg.orderCount += 1;
    for (const item of o.orderItems) {
      agg.spend += item.totalCost;
    }
    if (o.status === "DELIVERED" && o.deliveredDate) {
      agg.deliveredCount += 1;
      agg.leadDaysSum +=
        (o.deliveredDate.getTime() - o.dateOfOrder.getTime()) / MS_PER_DAY;
      if (o.expectedDeliveryDate) {
        agg.deliveriesWithExpected += 1;
        if (o.deliveredDate.getTime() <= o.expectedDeliveryDate.getTime()) {
          agg.onTime += 1;
        }
      }
    }
  }

  // Attributed lateness — un-excused events pinned on a supplier, scoped
  // to the caller's sites the same way.
  const latenessEvents = await prisma.latenessEvent.findMany({
    where: {
      excused: false,
      attributedSupplierId: { not: null },
      ...(siteIds !== null ? { siteId: { in: siteIds } } : {}),
    },
    select: { attributedSupplierId: true, daysLate: true },
  });
  for (const ev of latenessEvents) {
    // attributedSupplierId is filtered non-null above; guard for the type.
    if (!ev.attributedSupplierId) continue;
    const agg = bySupplier.get(ev.attributedSupplierId);
    // Only fold lateness into suppliers that already appear via orders —
    // a supplier with zero in-scope orders has no scorecard row to attach.
    if (!agg) continue;
    agg.attributedDaysLate += ev.daysLate;
  }

  const suppliers = Array.from(bySupplier.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15)
    .map((s) => ({
      id: s.id,
      name: s.name,
      orderCount: s.orderCount,
      spend: s.spend,
      onTimeRate:
        s.deliveriesWithExpected > 0
          ? Math.round((s.onTime / s.deliveriesWithExpected) * 100)
          : null,
      avgLeadDays:
        s.deliveredCount > 0
          ? Math.round(s.leadDaysSum / s.deliveredCount)
          : null,
      attributedDaysLate: s.attributedDaysLate,
    }));

  return NextResponse.json({ suppliers });
}
