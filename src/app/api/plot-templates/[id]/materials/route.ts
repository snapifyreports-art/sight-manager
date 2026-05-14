import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/materials — list materials on a template
// (or variant if ?variantId=X is passed; null means base template).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const variantId = searchParams.get("variantId");
  const materials = await prisma.templateMaterial.findMany({
    where: { templateId: id, variantId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(materials);
}

// POST /api/plot-templates/[id]/materials — add a material to a template
// (or variant if ?variantId=X is passed).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to manage templates" },
      { status: 403 },
    );
  }

  const { id: templateId } = await params;
  const { searchParams } = new URL(req.url);
  const variantId = searchParams.get("variantId");
  const body = await req.json();
  const { name, quantity, unit, unitCost, category, notes, linkedStageCode } = body;

  if (!name || typeof quantity !== "number") {
    return NextResponse.json({ error: "name and quantity (number) are required" }, { status: 400 });
  }

  try {
    const material = await prisma.templateMaterial.create({
      data: {
        templateId,
        variantId,
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
