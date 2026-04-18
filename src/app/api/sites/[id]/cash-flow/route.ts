import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * Remap an order date to the original job timeline.
 * If the job was delayed, order dates shifted with it. This maps them back
 * proportionally: how far through the current job window was this date?
 * Place it the same fraction through the original window.
 */
function remapToOriginal(
  orderDate: Date,
  jobStart: Date,
  jobEnd: Date,
  origStart: Date,
  origEnd: Date
): Date {
  const jobSpan = jobEnd.getTime() - jobStart.getTime();
  const origSpan = origEnd.getTime() - origStart.getTime();
  if (jobSpan <= 0 || origSpan <= 0) return orderDate;

  const fraction = (orderDate.getTime() - jobStart.getTime()) / jobSpan;
  // Clamp fraction to [0,1] — orders can precede or follow the job window
  const clamped = Math.max(0, Math.min(1, fraction));
  return new Date(origStart.getTime() + clamped * origSpan);
}

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const dateMode = _req.nextUrl.searchParams.get("dateMode") || "current";

  // Single query: all orders for this site with items + job dates for original mode
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
      job: {
        select: {
          startDate: true,
          endDate: true,
          originalStartDate: true,
          originalEndDate: true,
        },
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

  // Helper: remap a date to original timeline if in original mode and job has original dates
  function resolveDate(date: Date, job: typeof orderValues[number]["job"]): Date {
    if (
      dateMode !== "original" ||
      !job.startDate ||
      !job.endDate ||
      !job.originalStartDate ||
      !job.originalEndDate
    ) {
      return date;
    }
    return remapToOriginal(
      date,
      new Date(job.startDate),
      new Date(job.endDate),
      new Date(job.originalStartDate),
      new Date(job.originalEndDate)
    );
  }

  for (const o of orderValues) {
    if (o.total === 0) continue;

    // Committed spend: orders that are ORDERED (not yet delivered)
    if (o.status === "ORDERED") {
      const rawDate = new Date(o.dateOfOrder);
      const date = resolveDate(rawDate, o.job);
      const month = format(date, "yyyy-MM");
      const entry = monthMap.get(month) || { committed: 0, forecast: 0, actual: 0 };
      entry.committed += o.total;
      monthMap.set(month, entry);
    }

    // Forecast: PENDING orders by expected delivery date (fallback to dateOfOrder)
    if (o.status === "PENDING") {
      const rawDate = new Date(o.expectedDeliveryDate || o.dateOfOrder);
      const date = resolveDate(rawDate, o.job);
      const month = format(date, "yyyy-MM");
      const entry = monthMap.get(month) || { committed: 0, forecast: 0, actual: 0 };
      entry.forecast += o.total;
      monthMap.set(month, entry);
    }

    // Actual delivered: by delivered date (fall back to expected/order date)
    if (o.status === "DELIVERED") {
      const rawDate = new Date(o.deliveredDate || o.expectedDeliveryDate || o.dateOfOrder);
      // Delivered orders keep actual dates even in original mode
      const date = dateMode === "original"
        ? resolveDate(rawDate, o.job)
        : rawDate;
      const month = format(date, "yyyy-MM");
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

  // "committed" in totals matches Budget Report: money locked in with a supplier
  // (ORDERED or already DELIVERED). PENDING shown separately as "forecast"/pipeline.
  const totalOrderedOpen = orderValues
    .filter((o) => o.status === "ORDERED")
    .reduce((s, o) => s + o.total, 0);
  const totalForecast = orderValues
    .filter((o) => o.status === "PENDING")
    .reduce((s, o) => s + o.total, 0);
  const totalActual = orderValues
    .filter((o) => o.status === "DELIVERED")
    .reduce((s, o) => s + o.total, 0);
  const totalCommitted = totalOrderedOpen + totalActual;

  return NextResponse.json({
    months,
    totals: {
      committed: Math.round(totalCommitted * 100) / 100,
      orderedOpen: Math.round(totalOrderedOpen * 100) / 100,
      forecast: Math.round(totalForecast * 100) / 100,
      actual: Math.round(totalActual * 100) / 100,
    },
  });
}
