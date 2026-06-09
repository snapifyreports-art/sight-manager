import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/inspections/[id] — full detail (findings included).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // (Jun 2026 audit fix) Match the list route — VIEW_INSPECTIONS is the
  // boundary for all inspection detail, not just the list.
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "VIEW_INSPECTIONS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const insp = await prisma.inspection.findUnique({
    where: { id },
    include: {
      plot: { select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } } },
      anchorJob: { select: { id: true, name: true, startDate: true, endDate: true } },
      inspector: { select: { id: true, name: true, company: true, phone: true, email: true } },
      certificate: { select: { id: true, name: true, url: true, fileName: true } },
      snags: { select: { id: true, description: true, status: true, priority: true, contact: { select: { name: true } } } },
      ncrs: { select: { id: true, ref: true, title: true, status: true } },
    },
  });
  if (!insp) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, insp.plot.siteId))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }
  return NextResponse.json(insp);
}

// PATCH /api/inspections/[id] — field edits: inspector, notes, certificate.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "MANAGE_INSPECTIONS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.inspection.findUnique({
    where: { id },
    select: { plot: { select: { siteId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const body = await req.json();
  const { inspectorContactId, notes, certificateDocumentId } = body;

  try {
    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        ...(inspectorContactId !== undefined ? { inspectorContactId: inspectorContactId || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(certificateDocumentId !== undefined ? { certificateDocumentId: certificateDocumentId || null } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update inspection");
  }
}
