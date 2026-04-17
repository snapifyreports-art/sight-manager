import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.quantity !== undefined) data.quantity = parseFloat(body.quantity);
  if (body.unit !== undefined) data.unit = body.unit;
  if (body.unitCost !== undefined) data.unitCost = parseFloat(body.unitCost);

  // Recalculate totalCost
  const qty = (data.quantity as number) ?? item.quantity;
  const cost = (data.unitCost as number) ?? item.unitCost;
  data.totalCost = qty * cost;

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json(updated);
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

  await prisma.orderItem.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
