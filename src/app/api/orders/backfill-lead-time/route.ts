import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/orders/backfill-lead-time — one-time fix for missing leadTimeDays
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        // and push expectedDeliveryDate forward
        const newExpected = new Date(order.dateOfOrder);
        newExpected.setDate(newExpected.getDate() + 14);
        await prisma.materialOrder.update({
          where: { id: order.id },
          data: {
            leadTimeDays: 14,
            expectedDeliveryDate: newExpected,
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
