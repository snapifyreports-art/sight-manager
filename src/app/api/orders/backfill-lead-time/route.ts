import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapToWorkingDay } from "@/lib/working-days";

export const dynamic = "force-dynamic";

// POST /api/orders/backfill-lead-time — one-time fix for missing leadTimeDays
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Role guard. This is a destructive DB-wide write — only ADMIN/CEO
  // should be able to run it. Previously any authenticated user could
  // trigger it, which is fine for a single-tenant deployment but should
  // not stay open as we add users. P2 from the May 2026 audit.
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "CEO") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Fix template orders: set leadTimeAmount where missing
  const templateOrdersToFix = await prisma.templateOrder.findMany({
    where: { leadTimeAmount: null },
  });

  let templateFixed = 0;
  for (const to of templateOrdersToFix) {
    // Use deliveryWeekOffset if > 0, otherwise default to 2 weeks
    const amount = to.deliveryWeekOffset > 0 ? to.deliveryWeekOffset : 2;
    // Also fix deliveryWeekOffset to match lead time
    await prisma.templateOrder.update({
      where: { id: to.id },
      data: {
        leadTimeAmount: amount,
        leadTimeUnit: "weeks",
        deliveryWeekOffset: amount,
      },
    });
    templateFixed++;
  }

  // 2. Fix MaterialOrders: set leadTimeDays where missing
  const ordersToFix = await prisma.materialOrder.findMany({
    where: { leadTimeDays: null },
    select: {
      id: true,
      dateOfOrder: true,
      expectedDeliveryDate: true,
    },
  });

  let ordersFixed = 0;
  for (const order of ordersToFix) {
    if (order.dateOfOrder && order.expectedDeliveryDate) {
      const diffMs =
        order.expectedDeliveryDate.getTime() - order.dateOfOrder.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        // Has a real date difference — use it
        await prisma.materialOrder.update({
          where: { id: order.id },
          data: { leadTimeDays: diffDays },
        });
        ordersFixed++;
      } else {
        // dateOfOrder === expectedDeliveryDate — set default 14 days
        // and push expectedDeliveryDate forward. Snap to a working day
        // so we don't backfill a Sat/Sun delivery.
        const newExpected = new Date(order.dateOfOrder);
        newExpected.setDate(newExpected.getDate() + 14);
        await prisma.materialOrder.update({
          where: { id: order.id },
          data: {
            leadTimeDays: 14,
            expectedDeliveryDate: snapToWorkingDay(newExpected, "forward"),
          },
        });
        ordersFixed++;
      }
    }
  }

  return NextResponse.json({
    templateOrdersFixed: templateFixed,
    materialOrdersFixed: ordersFixed,
    message: "Backfill complete",
  });
}
