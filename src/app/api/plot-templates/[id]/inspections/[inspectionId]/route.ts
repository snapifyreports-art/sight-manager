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

function gate(
  session: { user?: { role?: string; permissions?: string[] } } | null,
) {
  if (!session) return { error: "Unauthorized", status: 401 };
  // (Jun 2026 Q7) Template inspections are an inspections concern — gate
  // on MANAGE_INSPECTIONS, not the broader programme-editing permission.
  if (!sessionHasPermission(session.user, "MANAGE_INSPECTIONS")) {
    return { error: "You do not have permission to manage inspections", status: 403 };
  }
  return null;
}

// PUT /api/plot-templates/[id]/inspections/[inspectionId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inspectionId: string }> },
) {
  const session = await auth();
  const denied = gate(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id: templateId, inspectionId } = await params;
  const existing = await prisma.templateInspection.findUnique({ where: { id: inspectionId } });
  if (!existing || existing.templateId !== templateId) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, type, description, anchorTemplateJobId, anchorEdge, offsetDays, bookingLeadWeeks, sortOrder, defaultInspectorContactId, isBlocking } = body;

  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "type must be a valid InspectionType" }, { status: 400 });
  }

  // If re-anchoring, validate the new anchor's scope.
  if (anchorTemplateJobId !== undefined && anchorTemplateJobId !== existing.anchorTemplateJobId) {
    const anchor = await prisma.templateJob.findUnique({
      where: { id: anchorTemplateJobId },
      select: { templateId: true, variantId: true },
    });
    if (
      !anchor ||
      anchor.templateId !== templateId ||
      (anchor.variantId ?? null) !== (existing.variantId ?? null)
    ) {
      return NextResponse.json(
        { error: "Anchor job must be a job on this template/variant" },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await prisma.templateInspection.update({
      where: { id: inspectionId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(anchorTemplateJobId !== undefined ? { anchorTemplateJobId } : {}),
        ...(anchorEdge !== undefined ? { anchorEdge: anchorEdge === "END" ? "END" : "START" } : {}),
        ...(offsetDays !== undefined ? { offsetDays: Math.trunc(Number(offsetDays)) || 0 } : {}),
        ...(bookingLeadWeeks !== undefined
          ? { bookingLeadWeeks: bookingLeadWeeks === null ? null : Math.trunc(Number(bookingLeadWeeks)) }
          : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
        ...(defaultInspectorContactId !== undefined
          ? { defaultInspectorContactId: defaultInspectorContactId || null }
          : {}),
        ...(isBlocking !== undefined ? { isBlocking: isBlocking === true } : {}),
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
          action: "inspection_changed",
          detail: `Edited inspection "${updated.name}"`,
          userId: session!.user.id,
          userName: session!.user.name ?? null,
        },
      })
      .catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update inspection");
  }
}

// DELETE /api/plot-templates/[id]/inspections/[inspectionId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; inspectionId: string }> },
) {
  const session = await auth();
  const denied = gate(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id: templateId, inspectionId } = await params;
  const existing = await prisma.templateInspection.findUnique({ where: { id: inspectionId } });
  if (!existing || existing.templateId !== templateId) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  try {
    await prisma.templateInspection.delete({ where: { id: inspectionId } });
    await prisma.templateAuditEvent
      .create({
        data: {
          templateId,
          action: "inspection_removed",
          detail: `Removed inspection "${existing.name}"`,
          userId: session!.user.id,
          userName: session!.user.name ?? null,
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete inspection");
  }
}
