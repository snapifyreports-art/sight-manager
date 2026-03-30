import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
      contact: true,
      orderItems: true,
      job: {
        include: {
          plot: { include: { site: true } },
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
    contactId,
    orderDetails,
    orderType,
    expectedDeliveryDate,
    leadTimeDays,
    itemsDescription,
    items,
  } = body as {
    supplierId: string;
    jobId: string;
    contactId?: string;
    orderDetails?: string;
    orderType?: string;
    expectedDeliveryDate?: string;
    leadTimeDays?: number | string;
    itemsDescription?: string;
    items?: Array<{ name: string; quantity: number; unit: string; unitCost: number }>;
  };

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
      contactId: contactId || null,
      orderDetails: orderDetails || null,
      orderType: orderType || null,
      expectedDeliveryDate: expectedDeliveryDate
        ? new Date(expectedDeliveryDate)
        : null,
      leadTimeDays: leadTimeDays ? parseInt(String(leadTimeDays), 10) : null,
      itemsDescription: itemsDescription || null,
      ...(items && items.length > 0
        ? {
            orderItems: {
              create: items.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                unitCost: item.unitCost,
              })),
            },
          }
        : {}),
    },
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

  await prisma.eventLog.create({
    data: {
      type: "ORDER_PLACED",
      description: `Order created for ${order.supplier.name} — ${order.job.name}`,
      siteId: order.job.plot.siteId,
      plotId: order.job.plotId,
      jobId: order.jobId,
      userId: session.user?.id || null,
    },
  });

  return NextResponse.json(order, { status: 201 });
}
