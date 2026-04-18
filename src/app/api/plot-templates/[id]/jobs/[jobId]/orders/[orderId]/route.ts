import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

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
  const {
    itemsDescription,
    orderWeekOffset,
    deliveryWeekOffset,
    supplierId,
    items,
    anchorType,
    anchorAmount,
    anchorUnit,
    anchorDirection,
    anchorJobId,
    leadTimeAmount,
    leadTimeUnit,
  } = body;

  const existing = await prisma.templateOrder.findUnique({
    where: { id: orderId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Template order not found" },
      { status: 404 }
    );
  }

  try {
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
        ...(anchorType !== undefined && { anchorType: anchorType || null }),
        ...(anchorAmount !== undefined && { anchorAmount: anchorAmount ?? null }),
        ...(anchorUnit !== undefined && { anchorUnit: anchorUnit || null }),
        ...(anchorDirection !== undefined && { anchorDirection: anchorDirection || null }),
        ...(anchorJobId !== undefined && { anchorJobId: anchorJobId || null }),
        ...(leadTimeAmount !== undefined && { leadTimeAmount: leadTimeAmount ?? null }),
        ...(leadTimeUnit !== undefined && { leadTimeUnit: leadTimeUnit || null }),
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
      include: {
        items: true,
        supplier: true,
        anchorJob: {
          select: { id: true, name: true, startWeek: true, stageCode: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update template order");
  }
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

  try {
    await prisma.templateOrder.delete({ where: { id: orderId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete template order");
  }
}
