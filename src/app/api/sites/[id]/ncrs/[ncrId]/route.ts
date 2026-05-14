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
  { params }: { params: Promise<{ id: string; ncrId: string }> },
) {
  const { id, ncrId } = await params;
  const a = await authorise(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "rootCause", "correctiveAction", "status"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("plotId" in body) data.plotId = body.plotId || null;
  if ("jobId" in body) data.jobId = body.jobId || null;
  if ("contactId" in body) data.contactId = body.contactId || null;

  // Auto-set closedAt + closedById when transitioning to RESOLVED or CLOSED.
  if (body.status === "RESOLVED" || body.status === "CLOSED") {
    data.closedAt = new Date();
    data.closedById = a.session.user.id;
  }

  try {
    const ncr = await prisma.nCR.update({ where: { id: ncrId }, data });
    return NextResponse.json(ncr);
  } catch (err) {
    return apiError(err, "Failed to update NCR");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ncrId: string }> },
) {
  const { id, ncrId } = await params;
  const a = await authorise(id, "DELETE_ITEMS");
  if ("error" in a) return a.error;

  try {
    await prisma.nCR.delete({ where: { id: ncrId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete NCR");
  }
}
