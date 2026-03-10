import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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

  // Handle status changes
  if (body.status !== undefined) {
    data.status = body.status;

    // Auto-set deliveredDate when status changes to DELIVERED (if not explicitly set)
    if (
      body.status === "DELIVERED" &&
      existing.status !== "DELIVERED" &&
      !body.deliveredDate
    ) {
      data.deliveredDate = new Date();
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
          description: `Order for ${existing.supplier.name} — ${existing.job.name} ${body.status === "DELIVERED" ? "delivery confirmed" : `status changed to ${body.status}`}`,
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
      description: `Order for ${existing.supplier.name} — ${existing.job.name} was deleted`,
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
