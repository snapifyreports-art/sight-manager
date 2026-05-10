import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";

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

  const items = await prisma.supplierMaterial.findMany({
    where: { supplierId: id },
    orderBy: { name: "asc" },
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

  // (May 2026 audit #67) Pricelist mutations are commercially sensitive
  // — only roles that handle supplier negotiations may write. Pre-fix
  // every authenticated user (including CONTRACTOR role) could create,
  // edit, and delete any supplier's pricing data.
  if (!sessionHasPermission(session.user, "MANAGE_ORDERS")) {
    return NextResponse.json(
      { error: "You don't have permission to edit supplier pricelists" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const item = await prisma.supplierMaterial.create({
    data: {
      supplierId: id,
      name: body.name.trim(),
      unit: body.unit || "each",
      unitCost: body.unitCost || 0,
      category: body.category || null,
      sku: body.sku || null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
