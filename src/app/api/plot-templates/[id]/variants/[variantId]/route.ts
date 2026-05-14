import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

function requireEditProgramme(session: { user: unknown }) {
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
  return null;
}

export const dynamic = "force-dynamic";

// PATCH — rename / re-describe a variant, or set its house value
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireEditProgramme(session);
  if (denied) return denied;

  const { id: templateId, variantId } = await params;
  const body = await req.json();
  const { name, description, buildBudget, salePrice } = body;

  // (May 2026 Keith request) House value is per-variant (variants are
  // different sizes). Empty / null → null; anything else → finite num.
  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  try {
    const updated = await prisma.templateVariant.update({
      where: { id: variantId, templateId },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && {
          description: description ? String(description).trim() : null,
        }),
        ...(buildBudget !== undefined && {
          buildBudget: numOrNull(buildBudget),
        }),
        ...(salePrice !== undefined && { salePrice: numOrNull(salePrice) }),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update variant");
  }
}

// DELETE — drop a variant (cascades to overrides)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireEditProgramme(session);
  if (denied) return denied;

  const { id: templateId, variantId } = await params;
  try {
    // (May 2026 user-journey audit Bug 7) Verify the variant belongs
    // to the templateId in the URL path. Pre-fix the lookup was
    // `findUnique({ where: { id: variantId } })` with no templateId
    // guard — a user with access to template B could
    // `DELETE /api/plot-templates/{B}/variants/{A.variantId}` and
    // wipe a variant of template A, with the audit event mis-
    // attributed to template B. PATCH already has this guard; DELETE
    // didn't.
    const variant = await prisma.templateVariant.findFirst({
      where: { id: variantId, templateId },
    });
    if (!variant) {
      return NextResponse.json(
        { error: "Variant not found" },
        { status: 404 },
      );
    }
    await prisma.templateVariant.delete({ where: { id: variantId } });
    await prisma.templateAuditEvent.create({
      data: {
        templateId,
        userId: session.user?.id ?? null,
        userName: session.user?.name ?? session.user?.email ?? null,
        action: "variant_removed",
        detail: `Removed variant "${variant.name}"`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete variant");
  }
}
