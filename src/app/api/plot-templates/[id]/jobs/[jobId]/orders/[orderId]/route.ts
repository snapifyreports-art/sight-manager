import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/plot-templates/[id]/jobs/[jobId]/orders/[orderId]
export async function PUT(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; jobId: string; orderId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const body = await request.json();
  const { itemsDescription, orderWeekOffset, deliveryWeekOffset, supplierId, items } = body;

  const existing = await prisma.templateOrder.findUnique({
    where: { id: orderId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Template order not found" },
      { status: 404 }
    );
  }

  // If items are provided, delete existing and recreate
  if (items) {
    await prisma.templateOrderItem.deleteMany({
      where: { templateOrderId: orderId },
    });
  }

  const updated = await prisma.templateOrder.update({
    where: { id: orderId },
    data: {
      ...(itemsDescription !== undefined && {
        itemsDescription: itemsDescription?.trim() || null,
      }),
      ...(supplierId !== undefined && { supplierId: supplierId || null }),
      ...(orderWeekOffset !== undefined && { orderWeekOffset }),
      ...(deliveryWeekOffset !== undefined && { deliveryWeekOffset }),
      ...(items && {
        items: {
          create: items.map(
            (item: {
              name: string;
              quantity?: number;
              unit?: string;
              unitCost?: number;
            }) => ({
              name: item.name,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? "units",
              unitCost: item.unitCost ?? 0,
            })
          ),
        },
      }),
    },
    include: { items: true, supplier: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/plot-templates/[id]/jobs/[jobId]/orders/[orderId]
export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; jobId: string; orderId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  const existing = await prisma.templateOrder.findUnique({
    where: { id: orderId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Template order not found" },
      { status: 404 }
    );
  }

  await prisma.templateOrder.delete({ where: { id: orderId } });

  return NextResponse.json({ success: true });
}
