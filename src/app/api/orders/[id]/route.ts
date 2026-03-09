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
      job: {
        include: {
          workflow: true,
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
    include: { supplier: true, job: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.supplierId !== undefined) data.supplierId = body.supplierId;
  if (body.jobId !== undefined) data.jobId = body.jobId;
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
  if (body.items !== undefined) data.items = body.items || null;

  // Handle status changes
  if (body.status !== undefined) {
    data.status = body.status;

    // Auto-set deliveredDate when status changes to DELIVERED
    if (body.status === "DELIVERED" && existing.status !== "DELIVERED") {
      data.deliveredDate = new Date();
    }

    // Create event log for status changes
    if (body.status !== existing.status) {
      const eventType =
        body.status === "DELIVERED"
          ? "ORDER_DELIVERED"
          : body.status === "CANCELLED"
            ? "ORDER_CANCELLED"
            : "ORDER_PLACED";

      await prisma.eventLog.create({
        data: {
          type: eventType,
          description: `Order for ${existing.supplier.name} — ${existing.job.name} status changed to ${body.status}`,
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
      job: {
        include: {
          workflow: true,
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
    include: { supplier: true, job: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  await prisma.eventLog.create({
    data: {
      type: "ORDER_CANCELLED",
      description: `Order for ${existing.supplier.name} — ${existing.job.name} was deleted`,
      jobId: existing.jobId,
      userId: session.user?.id || null,
    },
  });

  await prisma.materialOrder.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
