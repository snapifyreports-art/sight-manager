import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite, getUserSiteIds } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { enforceOrderInvariants } from "@/lib/order-invariants";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      contact: true,
      orderItems: true,
      job: {
        include: {
          plot: { include: { site: true } },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Site-access guard. Orders are bound to a site either via the job's
  // plot or directly (for plot-less / site-level orders). Either way the
  // caller must be able to see that site. 404 not 403 so we don't leak
  // existence of the order.
  const orderSiteId = order.job?.plot.siteId ?? order.siteId ?? null;
  if (!orderSiteId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      orderSiteId,
    ))
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      job: { include: { plot: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Site-access guard for the SOURCE order. Previously only checked on
  // cross-site jobId reassignment, so a same-job PUT (status flip,
  // supplier change, dates edit) bypassed access checks entirely. 404
  // instead of 403 so we don't leak existence to a caller without
  // rights.
  const sourceSiteId = existing.job?.plot.siteId ?? existing.siteId ?? null;
  if (!sourceSiteId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      sourceSiteId,
    ))
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Guard cross-site job reassignment — separate concern, must also be
  // able to reach the TARGET site.
  if (body.jobId !== undefined && body.jobId !== existing.jobId) {
    const targetJob = await prisma.job.findUnique({
      where: { id: body.jobId },
      select: { plot: { select: { siteId: true } } },
    });
    if (!targetJob) {
      return NextResponse.json({ error: "Target job not found" }, { status: 404 });
    }
    const accessibleSites = await getUserSiteIds(
      session.user.id,
      (session.user as { role: string }).role,
    );
    if (accessibleSites !== null) {
      if (
        !accessibleSites.includes(sourceSiteId) ||
        !accessibleSites.includes(targetJob.plot.siteId)
      ) {
        return NextResponse.json(
          { error: "You do not have access to both the source and target site" },
          { status: 403 }
        );
      }
    }
  }

  const data: Record<string, unknown> = {};

  if (body.supplierId !== undefined) data.supplierId = body.supplierId;
  if (body.jobId !== undefined) data.jobId = body.jobId;
  if (body.contactId !== undefined) data.contactId = body.contactId || null;
  if (body.orderDetails !== undefined)
    data.orderDetails = body.orderDetails || null;
  if (body.orderType !== undefined) data.orderType = body.orderType || null;
  if (body.expectedDeliveryDate !== undefined) {
    data.expectedDeliveryDate = body.expectedDeliveryDate
      ? new Date(body.expectedDeliveryDate)
      : null;
  }
  if (body.leadTimeDays !== undefined) {
    if (!body.leadTimeDays) {
      data.leadTimeDays = null;
    } else {
      // Guard NaN — a malformed body shouldn't poison the DB. parseInt
      // coerces "" → NaN; falsy check above handles "" but not "abc".
      const n = parseInt(String(body.leadTimeDays), 10);
      data.leadTimeDays = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  if (body.itemsDescription !== undefined) data.itemsDescription = body.itemsDescription || null;

  // Accept explicit deliveredDate
  if (body.deliveredDate !== undefined) {
    data.deliveredDate = body.deliveredDate
      ? new Date(body.deliveredDate)
      : null;
  }

  // Accept explicit dateOfOrder
  if (body.dateOfOrder !== undefined) {
    data.dateOfOrder = body.dateOfOrder
      ? new Date(body.dateOfOrder)
      : null;
  }

  // Handle status changes
  if (body.status !== undefined) {
    // PENDING → DELIVERED previously returned 400. But a ton of UI surfaces
    // ("Confirm Delivery" buttons in Daily Brief / Walkthrough / Programme)
    // let users jump straight from PENDING to DELIVERED — the action reads as
    // "this order arrived on site today" and nobody cares whether we ticked
    // Sent earlier. The block caused silent 400s: user thought they confirmed
    // delivery, system stayed PENDING, Daily Brief still showed "1 order not
    // sent" and "0 awaiting delivery" forever. Now we auto-bridge: mark the
    // order as placed + delivered in one call, server-side, so the state
    // machine stays consistent without blocking the user.
    const autoBridgePendingToDelivered =
      existing.status === "PENDING" && body.status === "DELIVERED";

    data.status = body.status;

    // Auto-set dateOfOrder when status changes to ORDERED (if not explicitly set)
    // Mirrors the behavior of start → PENDING→ORDERED auto-progression
    if (
      body.status === "ORDERED" &&
      existing.status !== "ORDERED" &&
      !existing.dateOfOrder &&
      body.dateOfOrder === undefined
    ) {
      data.dateOfOrder = getServerCurrentDate(req);
    }

    // Auto-set deliveredDate when status changes to DELIVERED (if not explicitly set)
    if (
      body.status === "DELIVERED" &&
      existing.status !== "DELIVERED" &&
      !body.deliveredDate
    ) {
      data.deliveredDate = getServerCurrentDate(req);
    }

    // Bridge case: if user jumped PENDING → DELIVERED, also back-fill
    // dateOfOrder so reports and supplier performance don't see a null.
    if (autoBridgePendingToDelivered && !existing.dateOfOrder && body.dateOfOrder === undefined) {
      data.dateOfOrder = getServerCurrentDate(req);
    }
  }

  // (#179) Enforce date invariants — the math should be the math.
  // Before this, the PENDING→DELIVERED bridge could leave the order
  // with deliveredDate=today but expectedDeliveryDate weeks in the
  // future (set previously by cascade), producing "delivered 8 months
  // early" artifacts in reports. The helper clamps so the date
  // ordering is always consistent.
  const today = getServerCurrentDate(req);
  const invariantPatch = enforceOrderInvariants(
    {
      dateOfOrder: existing.dateOfOrder,
      expectedDeliveryDate: existing.expectedDeliveryDate,
      deliveredDate: existing.deliveredDate,
      leadTimeDays: existing.leadTimeDays,
    },
    {
      dateOfOrder: data.dateOfOrder as Date | undefined,
      expectedDeliveryDate: data.expectedDeliveryDate as Date | null | undefined,
      deliveredDate: data.deliveredDate as Date | null | undefined,
      status: data.status as string | undefined,
      leadTimeDays: existing.leadTimeDays,
    },
    today,
  );
  Object.assign(data, invariantPatch);

  try {
    // Create event log for status changes
    if (body.status !== undefined && body.status !== existing.status) {
      const eventType =
        body.status === "DELIVERED"
          ? "DELIVERY_CONFIRMED"
          : body.status === "CANCELLED"
            ? "ORDER_CANCELLED"
            : "ORDER_PLACED";

      const orderLabel = existing.job?.name ?? "one-off order";
      await prisma.eventLog.create({
        data: {
          type: eventType,
          description: `[${existing.supplier.name}] Order for ${orderLabel} ${body.status === "DELIVERED" ? "delivery confirmed" : `status changed to ${body.status}`}`,
          siteId: existing.job?.plot.siteId ?? existing.siteId ?? null,
          plotId: existing.job?.plotId ?? existing.plotId ?? null,
          jobId: existing.jobId,
          userId: session.user?.id || null,
        },
      });
    }

    const order = await prisma.materialOrder.update({
      where: { id },
      data,
      include: {
        supplier: true,
        contact: true,
        orderItems: true,
        job: {
          include: {
            plot: { include: { site: true } },
          },
        },
      },
    });

    // (May 2026 audit follow-up to #152) Per-site push on delivery
    // confirmation — site assignee + watchers + execs get notified
    // that materials are on site. Best-effort; failure here doesn't
    // fail the order update.
    if (
      body.status === "DELIVERED" &&
      existing.status !== "DELIVERED"
    ) {
      const targetSiteId = existing.job?.plot.siteId ?? existing.siteId;
      if (targetSiteId) {
        const orderLabel = existing.job?.name ?? "one-off order";
        const { sendPushToSiteAudience } = await import("@/lib/push");
        void sendPushToSiteAudience(targetSiteId, "DELIVERY_CONFIRMED", {
          title: "📦 Delivery confirmed",
          body: `${existing.supplier.name}: ${orderLabel}`,
          url: `/orders?orderId=${id}`,
          tag: `delivery-${id}`,
        }).catch((err) => {
          console.warn("[order-update] sendPushToSiteAudience failed:", err);
        });
      }
    }

    return NextResponse.json(order);
  } catch (err) {
    return apiError(err, "Failed to update order");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "MANAGE_ORDERS")) {
    return NextResponse.json({ error: "You do not have permission to delete orders" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      job: { include: { plot: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    await prisma.eventLog.create({
      data: {
        type: "ORDER_CANCELLED",
        description: `[${existing.supplier.name}] Order for ${existing.job?.name ?? "one-off order"} was deleted`,
        siteId: existing.job?.plot.siteId ?? existing.siteId ?? null,
        plotId: existing.job?.plotId ?? existing.plotId ?? null,
        jobId: existing.jobId,
        userId: session.user?.id || null,
      },
    });

    await prisma.materialOrder.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete order");
  }
}
