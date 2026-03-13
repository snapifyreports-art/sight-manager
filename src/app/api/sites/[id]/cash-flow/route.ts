import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/cash-flow — cash flow data for a site
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Single query: all orders for this site with items
  const orders = await prisma.materialOrder.findMany({
    where: {
      job: { plot: { siteId: id } },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      status: true,
      dateOfOrder: true,
      expectedDeliveryDate: true,
      deliveredDate: true,
      orderItems: {
        select: { quantity: true, unitCost: true },
      },
    },
  });

  // Calculate total per order
  const orderValues = orders.map((o) => ({
    ...o,
    total: o.orderItems.reduce((s, i) => s + i.quantity * i.unitCost, 0),
  }));

  // Group by month
  const monthMap = new Map<
    string,
    { committed: number; forecast: number; actual: number }
  >();

  for (const o of orderValues) {
    if (o.total === 0) continue;

    // Committed spend: orders that are ORDERED, CONFIRMED, or DELIVERED
    if (["ORDERED", "CONFIRMED", "DELIVERED"].includes(o.status)) {
      const month = format(new Date(o.dateOfOrder), "yyyy-MM");
      const entry = monthMap.get(month) || { committed: 0, forecast: 0, actual: 0 };
      entry.committed += o.total;
      monthMap.set(month, entry);
    }

    // Forecast: PENDING orders by expected delivery date (fallback to dateOfOrder)
    if (o.status === "PENDING") {
      const forecastDate = o.expectedDeliveryDate || o.dateOfOrder;
      const month = format(new Date(forecastDate), "yyyy-MM");
      const entry = monthMap.get(month) || { committed: 0, forecast: 0, actual: 0 };
      entry.forecast += o.total;
      monthMap.set(month, entry);
    }

    // Actual delivered: by delivered date
    if (o.status === "DELIVERED" && o.deliveredDate) {
      const month = format(new Date(o.deliveredDate), "yyyy-MM");
      const entry = monthMap.get(month) || { committed: 0, forecast: 0, actual: 0 };
      entry.actual += o.total;
      monthMap.set(month, entry);
    }
  }

  // Sort by month and build cumulative
  const sortedMonths = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  let cumCommitted = 0;
  let cumForecast = 0;
  let cumActual = 0;

  const months = sortedMonths.map(([month, data]) => {
    cumCommitted += data.committed;
    cumForecast += data.forecast;
    cumActual += data.actual;
    return {
      month,
      committed: Math.round(data.committed * 100) / 100,
      forecast: Math.round(data.forecast * 100) / 100,
      actual: Math.round(data.actual * 100) / 100,
      cumulativeCommitted: Math.round(cumCommitted * 100) / 100,
      cumulativeForecast: Math.round((cumCommitted + cumForecast) * 100) / 100,
      cumulativeActual: Math.round(cumActual * 100) / 100,
    };
  });

  const totalCommitted = orderValues
    .filter((o) => ["ORDERED", "CONFIRMED", "DELIVERED"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);
  const totalForecast = orderValues
    .filter((o) => o.status === "PENDING")
    .reduce((s, o) => s + o.total, 0);
  const totalActual = orderValues
    .filter((o) => o.status === "DELIVERED")
    .reduce((s, o) => s + o.total, 0);

  return NextResponse.json({
    months,
    totals: {
      committed: Math.round(totalCommitted * 100) / 100,
      forecast: Math.round(totalForecast * 100) / 100,
      actual: Math.round(totalActual * 100) / 100,
    },
  });
}
