import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function authorise(siteId: string, requiredPermission?: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (
    requiredPermission &&
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      requiredPermission,
    )
  ) {
    return {
      error: NextResponse.json(
        { error: `You do not have permission (${requiredPermission})` },
        { status: 403 },
      ),
    };
  }
  return { session };
}

const COMPLIANCE_STATUSES = ["PENDING", "ACTIVE", "EXPIRED", "EXEMPT"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  // (Jun 2026 Wave-4 D9) Editing a compliance item requires MANAGE_COMPLIANCE.
  const a = await authorise(id, "MANAGE_COMPLIANCE");
  if ("error" in a) return a.error;

  // (Jun 2026 audit IDOR) The child must belong to the site in the URL.
  // Pre-fix a caller with access to ANY site could pair their own site
  // id with a foreign itemId and edit another site's compliance records.
  const existing = await prisma.siteComplianceItem.findUnique({
    where: { id: itemId },
    select: { siteId: true },
  });
  if (!existing || existing.siteId !== id) {
    return NextResponse.json({ error: "Compliance item not found" }, { status: 404 });
  }

  const body = await req.json();
  // (Jun 2026 audit) Validate status against the enum up front — a
  // typo'd client value previously reached Prisma and 500'd via apiError.
  if (body.status !== undefined && !COMPLIANCE_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${COMPLIANCE_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  try {
    const item = await prisma.siteComplianceItem.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.documentId !== undefined ? { documentId: body.documentId || null } : {}),
        ...(body.expiresAt !== undefined
          ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      },
    });
    return NextResponse.json(item);
  } catch (err) {
    return apiError(err, "Failed to update compliance item");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const a = await authorise(id, "DELETE_ITEMS");
  if ("error" in a) return a.error;

  try {
    // (Jun 2026 audit IDOR) deleteMany with both conditions — 404 when
    // the item doesn't belong to the site in the URL, instead of hard-
    // deleting another site's compliance record.
    const deleted = await prisma.siteComplianceItem.deleteMany({
      where: { id: itemId, siteId: id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Compliance item not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete compliance item");
  }
}
