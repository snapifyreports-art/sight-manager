import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/plot-templates/[id]/jobs/[jobId]/orders — add an order to a template job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;
  const body = await request.json();
  const { itemsDescription, orderWeekOffset, deliveryWeekOffset, supplierId, items } = body;

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  const order = await prisma.templateOrder.create({
    data: {
      templateJobId: jobId,
      supplierId: supplierId || null,
      itemsDescription: itemsDescription?.trim() || null,
      orderWeekOffset: orderWeekOffset ?? -2,
      deliveryWeekOffset: deliveryWeekOffset ?? 0,
      items: items?.length
        ? {
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
          }
        : undefined,
    },
    include: { items: true, supplier: true },
  });

  return NextResponse.json(order, { status: 201 });
}
