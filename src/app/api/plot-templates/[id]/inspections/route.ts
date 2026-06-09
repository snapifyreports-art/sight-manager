import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import type { InspectionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_TYPES: InspectionType[] = [
  "NHBC",
  "BUILDING_CONTROL",
  "WARRANTY_CML",
  "INTERNAL_QA",
  "OTHER",
];

// GET /api/plot-templates/[id]/inspections — list inspection defs on a
// template (or variant if ?variantId=X; null = base template).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const variantId = searchParams.get("variantId");
  const inspections = await prisma.templateInspection.findMany({
    where: { templateId: id, variantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      anchorJob: { select: { id: true, name: true, stageCode: true } },
      defaultInspector: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(inspections);
}

// POST /api/plot-templates/[id]/inspections — add an inspection def.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  const {
    name,
    type,
    description,
    anchorTemplateJobId,
    anchorEdge,
    offsetDays,
    bookingLeadWeeks,
    sortOrder,
    defaultInspectorContactId,
    isBlocking,
  } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "type must be a valid InspectionType" }, { status: 400 });
  }
  if (!anchorTemplateJobId) {
    return NextResponse.json({ error: "anchorTemplateJobId is required" }, { status: 400 });
  }

  // The anchor job must belong to the same template + variant scope.
  const anchor = await prisma.templateJob.findUnique({
    where: { id: anchorTemplateJobId },
    select: { templateId: true, variantId: true },
  });
  if (!anchor || anchor.templateId !== templateId || (anchor.variantId ?? null) !== (variantId ?? null)) {
    return NextResponse.json(
      { error: "Anchor job must be a job on this template/variant" },
      { status: 400 },
    );
  }

  try {
    const inspection = await prisma.templateInspection.create({
      data: {
        templateId,
        variantId,
        name: name.trim(),
        type,
        description: description?.trim() || null,
        anchorTemplateJobId,
        anchorEdge: anchorEdge === "END" ? "END" : "START",
        offsetDays: typeof offsetDays === "number" ? Math.trunc(offsetDays) : 0,
        bookingLeadWeeks:
          typeof bookingLeadWeeks === "number" ? Math.trunc(bookingLeadWeeks) : null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        defaultInspectorContactId: defaultInspectorContactId || null,
        isBlocking: isBlocking === true,
      },
      include: {
        anchorJob: { select: { id: true, name: true, stageCode: true } },
        defaultInspector: { select: { id: true, name: true } },
      },
    });

    await prisma.templateAuditEvent
      .create({
        data: {
          templateId,
          action: "inspection_added",
          detail: `Added inspection "${inspection.name}" (${inspection.type})`,
          userId: session.user.id,
          userName: session.user.name ?? null,
        },
      })
      .catch(() => {}); // audit is best-effort

    return NextResponse.json(inspection, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add inspection");
  }
}
