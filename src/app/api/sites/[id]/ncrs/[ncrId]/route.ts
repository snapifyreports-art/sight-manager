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

const NCR_STATUSES = ["OPEN", "INVESTIGATING", "AWAITING_CORRECTION", "RESOLVED", "CLOSED"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ncrId: string }> },
) {
  const { id, ncrId } = await params;
  // (Jun 2026 Wave-4 D9) Editing an NCR now requires MANAGE_COMPLIANCE.
  const a = await authorise(id, "MANAGE_COMPLIANCE");
  if ("error" in a) return a.error;

  // (Jun 2026 audit IDOR) The child must belong to the site in the URL.
  // Pre-fix a caller with access to ANY site could pair their own site
  // id with a foreign ncrId and edit QA records on sites they can't see.
  const existing = await prisma.nCR.findUnique({
    where: { id: ncrId },
    select: { siteId: true },
  });
  if (!existing || existing.siteId !== id) {
    return NextResponse.json({ error: "NCR not found" }, { status: 404 });
  }

  const body = await req.json();
  // (Jun 2026 audit) Validate status against the enum up front — a
  // typo'd client value previously reached Prisma and 500'd via apiError.
  if ("status" in body && !NCR_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${NCR_STATUSES.join(", ")}` },
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
  for (const key of ["rootCause", "correctiveAction"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("status" in body) data.status = body.status;
  if ("plotId" in body) data.plotId = body.plotId || null;
  if ("jobId" in body) data.jobId = body.jobId || null;
  if ("contactId" in body) data.contactId = body.contactId || null;

  // Auto-set closedAt + closedById when transitioning to RESOLVED or
  // CLOSED. (Jun 2026 audit) Reopening clears the closure stamp — a
  // reopened NCR must not still show "closed on X" beside an OPEN badge.
  if (body.status === "RESOLVED" || body.status === "CLOSED") {
    data.closedAt = new Date();
    data.closedById = a.session.user.id;
  } else if ("status" in body) {
    data.closedAt = null;
    data.closedById = null;
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
    // (Jun 2026 audit IDOR) deleteMany with both conditions — 404 when
    // the NCR doesn't belong to the site in the URL, instead of hard-
    // deleting another site's QA record.
    const deleted = await prisma.nCR.deleteMany({
      where: { id: ncrId, siteId: id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "NCR not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete NCR");
  }
}
