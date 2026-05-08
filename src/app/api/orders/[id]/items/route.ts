import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";

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
    select: { id: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const items = await prisma.orderItem.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, quantity, unit, unitCost } = body;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const order = await prisma.materialOrder.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // parseFloat returns NaN for non-numeric input — propagating NaN into
  // the DB pollutes every downstream cost/totalCost calculation. Coerce
  // any non-finite result back to a sensible default. Same defence in
  // /api/orders/[id]/items/[itemId] PUT.
  const qtyRaw = quantity ? parseFloat(String(quantity)) : 1;
  const costRaw = unitCost ? parseFloat(String(unitCost)) : 0;
  const qty = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? qtyRaw : 1;
  const cost = Number.isFinite(costRaw) && costRaw >= 0 ? costRaw : 0;
  const totalCost = qty * cost;

  try {
    const item = await prisma.orderItem.create({
      data: {
        orderId: id,
        name,
        quantity: qty,
        unit: unit || "units",
        unitCost: cost,
        totalCost,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add order item");
  }
}
