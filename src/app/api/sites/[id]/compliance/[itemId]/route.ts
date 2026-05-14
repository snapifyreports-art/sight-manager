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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const a = await authorise(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  const body = await req.json();
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
    await prisma.siteComplianceItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete compliance item");
  }
}
