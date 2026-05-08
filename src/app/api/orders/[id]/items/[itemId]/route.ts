import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const body = await req.json();

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId: id },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // parseFloat returns NaN for empty / non-numeric input. Without these
  // guards a "1.2.3" body would propagate NaN into the DB and silently
  // corrupt every cost downstream. Same guards in the POST handler.
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.quantity !== undefined) {
    const q = parseFloat(String(body.quantity));
    data.quantity = Number.isFinite(q) && q >= 0 ? q : item.quantity;
  }
  if (body.unit !== undefined) data.unit = body.unit;
  if (body.unitCost !== undefined) {
    const c = parseFloat(String(body.unitCost));
    data.unitCost = Number.isFinite(c) && c >= 0 ? c : item.unitCost;
  }

  // Recalculate totalCost from the sanitised values.
  const qty = (data.quantity as number) ?? item.quantity;
  const cost = (data.unitCost as number) ?? item.unitCost;
  data.totalCost = qty * cost;

  try {
    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update order item");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await params;

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId: id },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    await prisma.orderItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete order item");
  }
}
