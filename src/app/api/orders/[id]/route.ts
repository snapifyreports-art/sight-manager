import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";

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
    data.leadTimeDays = body.leadTimeDays
      ? parseInt(body.leadTimeDays, 10)
      : null;
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
    // Block invalid PENDING → DELIVERED direct transition (must go via ORDERED)
    if (existing.status === "PENDING" && body.status === "DELIVERED") {
      return NextResponse.json(
        { error: "Cannot mark PENDING order as DELIVERED — transition to ORDERED first" },
        { status: 400 }
      );
    }

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

    // Create event log for status changes
    if (body.status !== existing.status) {
      const eventType =
        body.status === "DELIVERED"
          ? "DELIVERY_CONFIRMED"
          : body.status === "CANCELLED"
            ? "ORDER_CANCELLED"
            : "ORDER_PLACED";

      await prisma.eventLog.create({
        data: {
          type: eventType,
          description: `[${existing.supplier.name}] Order for ${existing.job.name} ${body.status === "DELIVERED" ? "delivery confirmed" : `status changed to ${body.status}`}`,
          siteId: existing.job.plot.siteId,
          plotId: existing.job.plotId,
          jobId: existing.jobId,
          userId: session.user?.id || null,
        },
      });
    }
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

  return NextResponse.json(order);
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

  await prisma.eventLog.create({
    data: {
      type: "ORDER_CANCELLED",
      description: `[${existing.supplier.name}] Order for ${existing.job.name} was deleted`,
      siteId: existing.job.plot.siteId,
      plotId: existing.job.plotId,
      jobId: existing.jobId,
      userId: session.user?.id || null,
    },
  });

  await prisma.materialOrder.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
