import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

async function guard(plotId: string, userId: string, role: string) {
  const plot = await prisma.plot.findUnique({ where: { id: plotId }, select: { siteId: true } });
  if (!plot) return { status: 404 as const, body: { error: "Plot not found" } };
  if (!(await canAccessSite(userId, role, plot.siteId))) {
    return { status: 403 as const, body: { error: "You do not have access to this site" } };
  }
  return null;
}

// PUT /api/plots/[id]/materials/[materialId] — update qty, delivered, consumed
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: plotId, materialId } = await params;
  const g = await guard(plotId, session.user.id, (session.user as { role: string }).role);
  if (g) return NextResponse.json(g.body, { status: g.status });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.quantity !== undefined) data.quantity = Number(body.quantity);
  if (body.unit !== undefined) data.unit = String(body.unit).trim();
  if (body.unitCost !== undefined) data.unitCost = body.unitCost === null ? null : Number(body.unitCost);
  if (body.category !== undefined) data.category = body.category ? String(body.category).trim() : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
  if (body.linkedStageCode !== undefined) data.linkedStageCode = body.linkedStageCode ? String(body.linkedStageCode).trim() : null;
  if (body.delivered !== undefined) data.delivered = Number(body.delivered);
  if (body.consumed !== undefined) data.consumed = Number(body.consumed);

  // Guard: material belongs to this plot
  const existing = await prisma.plotMaterial.findUnique({ where: { id: materialId } });
  if (!existing || existing.plotId !== plotId) {
    return NextResponse.json({ error: "Material not found on this plot" }, { status: 404 });
  }

  const updated = await prisma.plotMaterial.update({ where: { id: materialId }, data });
  return NextResponse.json(updated);
}

// DELETE /api/plots/[id]/materials/[materialId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: plotId, materialId } = await params;
  const g = await guard(plotId, session.user.id, (session.user as { role: string }).role);
  if (g) return NextResponse.json(g.body, { status: g.status });

  const existing = await prisma.plotMaterial.findUnique({ where: { id: materialId } });
  if (!existing || existing.plotId !== plotId) {
    return NextResponse.json({ error: "Material not found on this plot" }, { status: 404 });
  }

  await prisma.plotMaterial.delete({ where: { id: materialId } });
  return NextResponse.json({ success: true });
}
