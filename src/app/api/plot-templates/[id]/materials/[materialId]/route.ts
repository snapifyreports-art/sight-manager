import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PUT /api/plot-templates/[id]/materials/[materialId] — update a template material
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { materialId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.quantity !== undefined) data.quantity = Number(body.quantity);
  if (body.unit !== undefined) data.unit = String(body.unit).trim();
  if (body.unitCost !== undefined) data.unitCost = body.unitCost === null ? null : Number(body.unitCost);
  if (body.category !== undefined) data.category = body.category ? String(body.category).trim() : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
  if (body.linkedStageCode !== undefined)
    data.linkedStageCode = body.linkedStageCode ? String(body.linkedStageCode).trim() : null;

  const updated = await prisma.templateMaterial.update({
    where: { id: materialId },
    data,
  });
  return NextResponse.json(updated);
}

// DELETE /api/plot-templates/[id]/materials/[materialId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { materialId } = await params;
  await prisma.templateMaterial.delete({ where: { id: materialId } });
  return NextResponse.json({ success: true });
}
