import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { deriveOrderOffsets } from "@/lib/template-order-offsets";

export const dynamic = "force-dynamic";

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
  const {
    itemsDescription,
    orderWeekOffset: clientOrderWeekOffset,
    deliveryWeekOffset: clientDeliveryWeekOffset,
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

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  // Derive legacy offsets from anchor fields server-side. Source of truth
  // for new templates is the anchor fields; offsets stay in the DB as a
  // computed cache so legacy readers don't break. Falls back to client-
  // supplied values only if anchor fields aren't present (legacy clients).
  const offsets = await deriveOrderOffsets(prisma, {
    ownerJobId: jobId,
    anchorType,
    anchorAmount,
    anchorUnit,
    anchorDirection,
    anchorJobId,
    leadTimeAmount,
    leadTimeUnit,
    fallbackOrderWeekOffset: clientOrderWeekOffset,
    fallbackDeliveryWeekOffset: clientDeliveryWeekOffset,
  });

  try {
    const order = await prisma.templateOrder.create({
      data: {
        templateJobId: jobId,
        supplierId: supplierId || null,
        itemsDescription: itemsDescription?.trim() || null,
        orderWeekOffset: offsets.orderWeekOffset,
        deliveryWeekOffset: offsets.deliveryWeekOffset,
        anchorType: anchorType || null,
        anchorAmount: anchorAmount ?? null,
        anchorUnit: anchorUnit || null,
        anchorDirection: anchorDirection || null,
        anchorJobId: anchorJobId || null,
        leadTimeAmount: leadTimeAmount ?? null,
        leadTimeUnit: leadTimeUnit || null,
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
      include: {
        items: true,
        supplier: true,
        anchorJob: {
          select: { id: true, name: true, startWeek: true, stageCode: true },
        },
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add template order");
  }
}
