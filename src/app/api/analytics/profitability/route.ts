import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #167) Per-plot profitability — sale price (sum of
 * PlotDrawSchedule) minus actual material cost (sum of PlotMaterial
 * delivered * unitCost) minus actual order cost (sum of MaterialOrder
 * orderItems where DELIVERED).
 *
 * Returns one row per plot the caller can access, sorted by profit
 * descending (most profitable first; loss-making plots float to the
 * bottom). Pure derivation — no schema additions.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const plotWhere = siteIds !== null ? { siteId: { in: siteIds } } : {};

  const plots = await prisma.plot.findMany({
    where: plotWhere,
    select: {
      id: true,
      name: true,
      plotNumber: true,
      siteId: true,
      site: { select: { name: true } },
      materials: { select: { delivered: true, unitCost: true } },
      drawSchedule: {
        where: { status: { in: ["PAID", "DUE", "SCHEDULED"] } },
        select: { amount: true },
      },
      jobs: {
        select: {
          orders: {
            where: { status: "DELIVERED" },
            select: { orderItems: { select: { quantity: true, unitCost: true } } },
          },
        },
      },
    },
  });

  const rows = plots.map((p) => {
    const revenue = p.drawSchedule.reduce((s, d) => s + d.amount, 0);
    const materialCost = p.materials.reduce(
      (s, m) => s + (m.delivered ?? 0) * (m.unitCost ?? 0),
      0,
    );
    const orderCost = p.jobs
      .flatMap((j) => j.orders)
      .flatMap((o) => o.orderItems)
      .reduce((s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0), 0);
    const cost = materialCost + orderCost;
    const profit = revenue - cost;
    const margin = revenue > 0 ? profit / revenue : 0;
    return {
      plotId: p.id,
      plotName: p.name,
      plotNumber: p.plotNumber,
      siteId: p.siteId,
      siteName: p.site.name,
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPct: Math.round(margin * 100),
    };
  });
  rows.sort((a, b) => b.profit - a.profit);

  const totals = {
    plotCount: rows.length,
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
    profit: rows.reduce((s, r) => s + r.profit, 0),
  };

  return NextResponse.json({ rows, totals });
}
