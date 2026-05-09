import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/variants — list variants on a template
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Variant content (jobs/materials/documents) is fetched via
  // /variants/[variantId]/full, not via this list endpoint. The
  // jobOverrides + materialOverrides relations are deprecated post
  // May-2026 full-fat rework — they're left in the schema for safety
  // but no longer read.
  const variants = await prisma.templateVariant.findMany({
    where: { templateId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(variants);
}

// POST /api/plot-templates/[id]/variants — create a variant
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await req.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Variant name is required" },
      { status: 400 },
    );
  }

  // Place new variant at the end
  const last = await prisma.templateVariant.findFirst({
    where: { templateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextOrder = last ? last.sortOrder + 1 : 0;

  try {
    const variant = await prisma.templateVariant.create({
      data: {
        templateId,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder: nextOrder,
      },
    });

    await prisma.templateAuditEvent.create({
      data: {
        templateId,
        userId: session.user?.id ?? null,
        userName: session.user?.name ?? session.user?.email ?? null,
        action: "variant_added",
        detail: `Added variant "${variant.name}"`,
      },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create variant");
  }
}
