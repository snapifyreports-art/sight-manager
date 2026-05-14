import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function authoriseByPlot(plotId: string, requiredPermission?: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { siteId: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))
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
  { params }: { params: Promise<{ id: string; defectId: string }> },
) {
  const { id, defectId } = await params;
  const a = await authoriseByPlot(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "contractorId"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("status" in body) {
    data.status = body.status;
    if (body.status === "RESOLVED" || body.status === "CLOSED") {
      data.resolvedAt = new Date();
      data.resolvedById = a.session.user.id;
    }
  }

  try {
    const d = await prisma.defectReport.update({
      where: { id: defectId },
      data,
    });
    return NextResponse.json(d);
  } catch (err) {
    return apiError(err, "Failed to update defect");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; defectId: string }> },
) {
  const { id, defectId } = await params;
  const a = await authoriseByPlot(id, "DELETE_ITEMS");
  if ("error" in a) return a.error;
  try {
    await prisma.defectReport.delete({ where: { id: defectId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete defect");
  }
}
