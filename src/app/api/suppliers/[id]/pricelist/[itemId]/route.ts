import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (May 2026 audit #67) Pricelist mutations are commercially sensitive
  // — only roles with MANAGE_ORDERS may write.
  if (!sessionHasPermission(session.user, "MANAGE_ORDERS")) {
    return NextResponse.json(
      { error: "You don't have permission to edit supplier pricelists" },
      { status: 403 },
    );
  }

  const { itemId } = await params;
  const body = await req.json();

  const existing = await prisma.supplierMaterial.findUnique({ where: { id: itemId } });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const item = await prisma.supplierMaterial.update({
    where: { id: itemId },
    data: {
      name: body.name !== undefined ? body.name.trim() : existing.name,
      unit: body.unit !== undefined ? body.unit : existing.unit,
      unitCost: body.unitCost !== undefined ? body.unitCost : existing.unitCost,
      category: body.category !== undefined ? body.category : existing.category,
      sku: body.sku !== undefined ? body.sku : existing.sku,
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (May 2026 audit #67) Pricelist deletion gated to MANAGE_ORDERS.
  if (!sessionHasPermission(session.user, "MANAGE_ORDERS")) {
    return NextResponse.json(
      { error: "You don't have permission to delete pricelist items" },
      { status: 403 },
    );
  }

  const { itemId } = await params;

  const existing = await prisma.supplierMaterial.findUnique({ where: { id: itemId } });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.supplierMaterial.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
