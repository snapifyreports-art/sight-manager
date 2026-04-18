import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/materials — list materials on a template
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const materials = await prisma.templateMaterial.findMany({
    where: { templateId: id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(materials);
}

// POST /api/plot-templates/[id]/materials — add a material to a template
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await req.json();
  const { name, quantity, unit, unitCost, category, notes, linkedStageCode } = body;

  if (!name || typeof quantity !== "number") {
    return NextResponse.json({ error: "name and quantity (number) are required" }, { status: 400 });
  }

  try {
    const material = await prisma.templateMaterial.create({
      data: {
        templateId,
        name: name.trim(),
        quantity,
        unit: (unit || "each").trim(),
        unitCost: unitCost ?? null,
        category: category?.trim() || null,
        notes: notes?.trim() || null,
        linkedStageCode: linkedStageCode?.trim() || null,
      },
    });
    return NextResponse.json(material, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add template material");
  }
}
