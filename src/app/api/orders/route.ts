import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (jobId) where.jobId = jobId;
  if (status) where.status = status;

  const orders = await prisma.materialOrder.findMany({
    where,
    include: {
      supplier: true,
      job: {
        include: {
          workflow: true,
        },
      },
    },
    orderBy: { dateOfOrder: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    supplierId,
    jobId,
    orderDetails,
    orderType,
    expectedDeliveryDate,
    leadTimeDays,
    items,
  } = body;

  if (!supplierId || !jobId) {
    return NextResponse.json(
      { error: "supplierId and jobId are required" },
      { status: 400 }
    );
  }

  const order = await prisma.materialOrder.create({
    data: {
      supplierId,
      jobId,
      orderDetails: orderDetails || null,
      orderType: orderType || null,
      expectedDeliveryDate: expectedDeliveryDate
        ? new Date(expectedDeliveryDate)
        : null,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      items: items || null,
    },
    include: {
      supplier: true,
      job: {
        include: {
          workflow: true,
        },
      },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "ORDER_PLACED",
      description: `Order created for ${order.supplier.name} — ${order.job.name}`,
      jobId: order.jobId,
      userId: session.user?.id || null,
    },
  });

  return NextResponse.json(order, { status: 201 });
}
