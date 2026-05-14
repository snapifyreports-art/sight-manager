import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function guardPlot(plotId: string, userId: string, role: string) {
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { siteId: true },
  });
  if (!plot) return { status: 404 as const, body: { error: "Plot not found" } };
  if (!(await canAccessSite(userId, role, plot.siteId))) {
    return { status: 403 as const, body: { error: "You do not have access to this site" } };
  }
  return null;
}

// GET /api/plots/[id]/materials
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const guard = await guardPlot(id, session.user.id, (session.user as { role: string }).role);
  if (guard) return NextResponse.json(guard.body, { status: guard.status });

  const materials = await prisma.plotMaterial.findMany({
    where: { plotId: id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(materials);
}

// POST /api/plots/[id]/materials — add a manual quant to a plot
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // (May 2026 pattern sweep) Plot quants are programme content; gate
  // on EDIT_PROGRAMME so contractors can't seed arbitrary material rows.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to add materials" },
      { status: 403 },
    );
  }

  const { id: plotId } = await params;
  const guard = await guardPlot(plotId, session.user.id, (session.user as { role: string }).role);
  if (guard) return NextResponse.json(guard.body, { status: guard.status });

  const body = await req.json();
  const { name, quantity, unit, unitCost, category, notes, linkedStageCode, delivered, consumed } = body;

  if (!name || typeof quantity !== "number") {
    return NextResponse.json({ error: "name and quantity (number) are required" }, { status: 400 });
  }

  try {
    const material = await prisma.plotMaterial.create({
      data: {
        plotId,
        sourceType: "MANUAL",
        name: String(name).trim(),
        quantity,
        unit: (unit || "each").trim(),
        unitCost: unitCost ?? null,
        category: category?.trim() || null,
        notes: notes?.trim() || null,
        linkedStageCode: linkedStageCode?.trim() || null,
        delivered: delivered ?? 0,
        consumed: consumed ?? 0,
      },
    });
    return NextResponse.json(material, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create material");
  }
}
