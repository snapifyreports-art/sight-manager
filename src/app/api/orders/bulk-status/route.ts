import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

// POST /api/orders/bulk-status — bulk update order statuses
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderIds, status } = await req.json();

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "orderIds required" }, { status: 400 });
  }

  const validStatuses = ["ORDERED", "DELIVERED", "CANCELLED"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const now = getServerCurrentDate(req);
  let updated = 0;

  // Process sequentially to respect Supabase connection limits
  for (const orderId of orderIds) {
    try {
      const existing = await prisma.materialOrder.findUnique({
        where: { id: orderId },
        include: {
          supplier: true,
          job: { include: { plot: true } },
        },
      });

      if (!existing) continue;

      // Block invalid PENDING → DELIVERED direct transition (must go via ORDERED)
      if (existing.status === "PENDING" && status === "DELIVERED") continue;
      // Skip no-op transitions
      if (existing.status === status) continue;

      const data: Record<string, unknown> = { status };

      // Auto-set dateOfOrder when marking as ORDERED
      if (status === "ORDERED" && !existing.dateOfOrder) {
        data.dateOfOrder = now;
      }
      // Auto-set deliveredDate when marking as DELIVERED
      if (status === "DELIVERED" && existing.status !== "DELIVERED") {
        data.deliveredDate = now;
      }

      await prisma.materialOrder.update({
        where: { id: orderId },
        data,
      });

      // Create event log
      if (status !== existing.status) {
        const eventType =
          status === "DELIVERED"
            ? "DELIVERY_CONFIRMED"
            : status === "CANCELLED"
              ? "ORDER_CANCELLED"
              : "ORDER_PLACED";

        await prisma.eventLog.create({
          data: {
            type: eventType,
            description: `[${existing.supplier.name}] Order for ${existing.job.name} status changed to ${status} (bulk)`,
            siteId: existing.job.plot.siteId,
            plotId: existing.job.plotId,
            jobId: existing.jobId,
            userId: session.user?.id || null,
          },
        });
      }

      updated++;
    } catch (e) {
      console.error(`Bulk status error for order ${orderId}:`, e);
    }
  }

  return NextResponse.json({ updated });
}
