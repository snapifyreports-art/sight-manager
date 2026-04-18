import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/sites/[id]/one-off-orders
 *
 * Create a one-off order at site level (or targeting a specific plot on this site).
 * Body: { supplierId, contactId?, plotId? (must belong to this site), items: [...], itemsDescription?, expectedDeliveryDate? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: siteId } = await params;
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const body = await req.json();
  const {
    supplierId,
    contactId,
    plotId,
    items,
    itemsDescription,
    expectedDeliveryDate,
    leadTimeDays,
    orderDetails,
    orderType,
  } = body as {
    supplierId: string;
    contactId?: string;
    plotId?: string;
    items?: Array<{ name: string; quantity: number; unit?: string; unitCost?: number }>;
    itemsDescription?: string;
    expectedDeliveryDate?: string;
    leadTimeDays?: number | string;
    orderDetails?: string;
    orderType?: string;
  };

  if (!supplierId) {
    return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  }

  // If plotId provided, verify it belongs to this site
  if (plotId) {
    const plot = await prisma.plot.findUnique({ where: { id: plotId }, select: { siteId: true } });
    if (!plot || plot.siteId !== siteId) {
      return NextResponse.json({ error: "plotId must belong to this site" }, { status: 400 });
    }
  }

  try {
    const order = await prisma.materialOrder.create({
      data: {
        supplierId,
        jobId: null,
        siteId,
        plotId: plotId || null,
        oneOff: true,
        contactId: contactId || null,
        orderDetails: orderDetails || null,
        orderType: orderType || null,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        leadTimeDays: leadTimeDays ? parseInt(String(leadTimeDays), 10) : null,
        itemsDescription: itemsDescription || null,
        ...(items && items.length > 0
          ? {
              orderItems: {
                create: items.map((item) => ({
                  name: item.name,
                  quantity: item.quantity,
                  unit: item.unit || "each",
                  unitCost: item.unitCost ?? 0,
                  totalCost: (item.quantity ?? 1) * (item.unitCost ?? 0),
                })),
              },
            }
          : {}),
      },
      include: {
        supplier: true,
        orderItems: true,
        plot: { select: { id: true, plotNumber: true, name: true } },
      },
    });

    await prisma.eventLog.create({
      data: {
        type: "ORDER_PLACED",
        description: `[${order.supplier.name}] One-off order created${plotId ? ` for plot ${order.plot?.plotNumber ?? plotId}` : " at site level"}`,
        siteId,
        plotId: plotId || null,
        userId: session.user.id,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create one-off order");
  }
}
