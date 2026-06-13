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

const DEFECT_STATUSES = ["REPORTED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; defectId: string }> },
) {
  const { id, defectId } = await params;
  // (Jun 2026 Wave-4 D9) Editing a defect now requires MANAGE_COMPLIANCE.
  const a = await authoriseByPlot(id, "MANAGE_COMPLIANCE");
  if ("error" in a) return a.error;

  // (Jun 2026 audit IDOR) The child must belong to the plot in the URL.
  // Pre-fix a caller with access to ANY site could pair their own plot
  // id with a foreign defectId and edit QA records on sites they can't see.
  const existing = await prisma.defectReport.findUnique({
    where: { id: defectId },
    select: { plotId: true },
  });
  if (!existing || existing.plotId !== id) {
    return NextResponse.json({ error: "Defect not found" }, { status: 404 });
  }

  const body = await req.json();
  // (Jun 2026 audit) Validate status against the enum up front — a
  // typo'd client value previously reached Prisma and 500'd via apiError.
  if ("status" in body && !DEFECT_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${DEFECT_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  // (Jun 2026 audit) Required columns skip empty values instead of
  // nulling them — `title: ""` previously wrote title=null → Prisma 500.
  for (const key of ["title", "description"]) {
    if (key in body && typeof body[key] === "string" && body[key].trim()) {
      data[key] = body[key];
    }
  }
  if ("contractorId" in body) data.contractorId = body.contractorId || null;
  if ("status" in body) {
    data.status = body.status;
    if (body.status === "RESOLVED" || body.status === "CLOSED") {
      data.resolvedAt = new Date();
      data.resolvedById = a.session.user.id;
    } else {
      // (Jun 2026 audit) Reopening (→ REPORTED/IN_PROGRESS) must clear
      // the resolution stamp, mirroring the NCR/variation routes —
      // otherwise the UI shows "Resolved …" beside a reopened defect.
      data.resolvedAt = null;
      data.resolvedById = null;
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
    // (Jun 2026 audit IDOR) deleteMany with both conditions — 404 when
    // the defect doesn't belong to the plot in the URL, instead of hard-
    // deleting another site's QA record.
    const deleted = await prisma.defectReport.deleteMany({
      where: { id: defectId, plotId: id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Defect not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete defect");
  }
}
