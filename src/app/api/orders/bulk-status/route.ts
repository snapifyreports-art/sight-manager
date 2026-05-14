import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/orders/bulk-status — bulk update order statuses
// Caller: TasksClient.handleMarkGroupSent — marks all orders in a supplier
// group as ORDERED atomically (more efficient than N per-order PUTs).
// Keep. Consumer audit last run: Apr 2026 session handover spot-check.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (May 2026 pattern sweep) Gate on MANAGE_ORDERS. Per-order
  // canAccessSite is below but the role gate must also apply.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "MANAGE_ORDERS",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to manage orders" },
      { status: 403 },
    );
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

      // (May 2026 audit #1) Verify caller has access to the order's
      // site before mutating status. Pre-fix any logged-in user could
      // change any order's status across every site.
      const orderSiteId = existing.job?.plot?.siteId ?? existing.siteId;
      if (
        orderSiteId &&
        !(await canAccessSite(
          session.user.id,
          (session.user as { role: string }).role,
          orderSiteId,
        ))
      ) {
        continue; // silently skip orders the caller can't access
      }

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
            description: `[${existing.supplier.name}] Order for ${existing.job?.name ?? "one-off order"} status changed to ${status} (bulk)`,
            siteId: existing.job?.plot.siteId ?? existing.siteId ?? null,
            plotId: existing.job?.plotId ?? existing.plotId ?? null,
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
