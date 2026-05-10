import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/supplier-analysis
 *
 * Per-supplier performance breakdown for a site. Used by:
 *   - Handover ZIP's `/04_Supplier_Analysis/` section
 *
 * Counts orders, late deliveries, total days late, and lists each
 * order with status + delivery dates for the per-supplier PDF.
 */

interface SupplierRow {
  supplierId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  ordersTotal: number;
  ordersDelivered: number;
  ordersLate: number;
  ordersOutstanding: number;
  totalDaysLate: number;
  orders: Array<{
    orderId: string;
    items: string;
    status: string;
    expectedDelivery: string | null;
    actualDelivery: string | null;
    daysLate: number | null;
    plotNumber: string | null;
    jobName: string | null;
  }>;
}

function workingDaysBetween(a: Date, b: Date): number {
  if (b <= a) return 0;
  let count = 0;
  const cursor = new Date(a);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      id,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  try {
    // Orders that touched this site — either via job→plot→site or via
    // direct `siteId` on one-off orders.
    const orders = await prisma.materialOrder.findMany({
      where: {
        OR: [
          { job: { plot: { siteId: id } } },
          { siteId: id },
        ],
      },
      select: {
        id: true,
        itemsDescription: true,
        status: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        supplier: {
          select: {
            id: true,
            name: true,
            contactName: true,
            contactEmail: true,
          },
        },
        job: {
          select: {
            name: true,
            plot: { select: { plotNumber: true } },
          },
        },
      },
    });

    const map = new Map<string, SupplierRow>();
    for (const o of orders) {
      const row =
        map.get(o.supplier.id) ?? {
          supplierId: o.supplier.id,
          name: o.supplier.name,
          contactName: o.supplier.contactName,
          contactEmail: o.supplier.contactEmail,
          ordersTotal: 0,
          ordersDelivered: 0,
          ordersLate: 0,
          ordersOutstanding: 0,
          totalDaysLate: 0,
          orders: [],
        };

      row.ordersTotal++;
      let daysLate: number | null = null;

      if (o.status === "DELIVERED") {
        row.ordersDelivered++;
        if (o.deliveredDate && o.expectedDeliveryDate) {
          if (o.deliveredDate.getTime() > o.expectedDeliveryDate.getTime()) {
            row.ordersLate++;
            daysLate = workingDaysBetween(
              o.expectedDeliveryDate,
              o.deliveredDate,
            );
            row.totalDaysLate += daysLate;
          } else {
            daysLate = 0;
          }
        }
      } else if (o.status !== "CANCELLED") {
        row.ordersOutstanding++;
      }

      row.orders.push({
        orderId: o.id,
        items: o.itemsDescription ?? "",
        status: o.status,
        expectedDelivery: o.expectedDeliveryDate?.toISOString() ?? null,
        actualDelivery: o.deliveredDate?.toISOString() ?? null,
        daysLate,
        plotNumber: o.job?.plot?.plotNumber ?? null,
        jobName: o.job?.name ?? null,
      });

      map.set(o.supplier.id, row);
    }

    const suppliers = Array.from(map.values()).sort(
      (a, b) => b.ordersTotal - a.ordersTotal,
    );
    return NextResponse.json({ suppliers });
  } catch (err) {
    return apiError(err, "Failed to build supplier analysis");
  }
}
