import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";
import { computeInspectionScheduledDate } from "@/lib/inspection-dates";
import { logEvent } from "@/lib/event-log";
import { getServerStartOfDay } from "@/lib/dev-date";

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
    select: {
      plotId: true,
      name: true,
      status: true,
      bookedDate: true,
      plot: { select: { siteId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const body = await req.json();
  const { inspectorContactId, notes, certificateDocumentId, anchorJobId, anchorEdge, offsetDays, isBlocking } = body;

  // (Jun 2026 D4) Hard-blocker flag is editable while the inspection is
  // still live — a PASSED/FAILED result is frozen, so the flag is too.
  if (isBlocking !== undefined && (existing.status === "PASSED" || existing.status === "FAILED")) {
    return NextResponse.json(
      { error: `Can't change the hard-blocker flag on an inspection that is ${existing.status}` },
      { status: 400 },
    );
  }

  // (Jun 2026 S15+S17) Re-attach (or detach) the anchor job in-app — the
  // reschedule action detaches the anchor to hold a manual date, and until
  // now the only way back was via the template. PASSED/FAILED are frozen
  // facts; their dates never re-derive.
  let anchorData: {
    anchorJobId?: string | null;
    anchorEdge?: "START" | "END";
    offsetDays?: number;
    scheduledDate?: Date;
    status?: "SCHEDULED" | "BOOKED";
  } = {};
  if (anchorJobId !== undefined) {
    if (existing.status === "PASSED" || existing.status === "FAILED") {
      return NextResponse.json(
        { error: `Can't re-anchor an inspection that is ${existing.status} — its result is frozen` },
        { status: 400 },
      );
    }
    if (anchorJobId === null || anchorJobId === "") {
      anchorData = { anchorJobId: null };
    } else {
      const job = await prisma.job.findUnique({
        where: { id: anchorJobId },
        select: { id: true, plotId: true, startDate: true, endDate: true },
      });
      // Anchor must be a job on the SAME plot — a cross-plot anchor would
      // silently drive this hold-point off another plot's programme.
      if (!job || job.plotId !== existing.plotId) {
        return NextResponse.json(
          { error: "The anchor job must belong to the same plot as the inspection" },
          { status: 400 },
        );
      }
      const edge: "START" | "END" = anchorEdge === "START" ? "START" : "END";
      const offset = Number.isFinite(Number(offsetDays)) ? Math.trunc(Number(offsetDays)) : 0;
      const newDate = computeInspectionScheduledDate(job, edge, offset);
      if (!newDate) {
        return NextResponse.json(
          { error: "That job has no dates yet — give it a start/end date first or pick another anchor" },
          { status: 400 },
        );
      }
      anchorData = { anchorJobId: job.id, anchorEdge: edge, offsetDays: offset, scheduledDate: newDate };
      // Mirror recomputeInspectionDates: an OVERDUE row whose new derived
      // date is today-or-later is no longer overdue. Dev-date-aware so QA
      // date simulation agrees with the cron/dashboard surfaces.
      if (existing.status === "OVERDUE") {
        const todayStart = getServerStartOfDay(req);
        if (newDate.getTime() >= todayStart.getTime()) {
          anchorData.status = existing.bookedDate ? "BOOKED" : "SCHEDULED";
        }
      }
    }
  }

  try {
    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        ...(inspectorContactId !== undefined ? { inspectorContactId: inspectorContactId || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(certificateDocumentId !== undefined ? { certificateDocumentId: certificateDocumentId || null } : {}),
        ...(isBlocking !== undefined ? { isBlocking: Boolean(isBlocking) } : {}),
        ...anchorData,
      },
    });
    if (anchorData.anchorJobId !== undefined) {
      await logEvent(prisma, {
        type: "INSPECTION_SCHEDULED",
        description: anchorData.anchorJobId
          ? `Inspection "${existing.name}" re-anchored to a job`
          : `Inspection "${existing.name}" detached from its anchor job`,
        siteId: existing.plot.siteId,
        plotId: existing.plotId,
        jobId: anchorData.anchorJobId ?? undefined,
        userId: session.user.id,
        detail: { inspectionId: id },
      }).catch(() => {});
    }
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update inspection");
  }
}

// DELETE /api/inspections/[id] — remove a hold-point.
//
// (Jun 2026 R29) Deleting an inspection is a destructive admin action, so
// it's MANAGE_INSPECTIONS + site-access gated. It's also refused (400)
// when the inspection carries history that a delete would orphan or erase:
//   - status === PASSED         → a frozen, signed-off result
//   - findings (snags + ncrs)   → deleting would orphan the findings
//   - certificateDocumentId set → a filed certificate is attached
// The UI hides the delete control for PASSED rows; the other two are
// enforced here as the authoritative guard.
export async function DELETE(
  _req: NextRequest,
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
    select: {
      name: true,
      status: true,
      plotId: true,
      certificateDocumentId: true,
      plot: { select: { siteId: true } },
      _count: { select: { snags: true, ncrs: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  if (existing.status === "PASSED") {
    return NextResponse.json(
      { error: "Can't delete a passed inspection — its result is a frozen record." },
      { status: 400 },
    );
  }
  const findingCount = existing._count.snags + existing._count.ncrs;
  if (findingCount > 0) {
    return NextResponse.json(
      { error: `This inspection has ${findingCount} finding${findingCount !== 1 ? "s" : ""} attached — resolve or detach them before deleting.` },
      { status: 400 },
    );
  }
  if (existing.certificateDocumentId) {
    return NextResponse.json(
      { error: "A certificate is filed against this inspection — remove it before deleting." },
      { status: 400 },
    );
  }

  try {
    await prisma.inspection.delete({ where: { id } });
    await logEvent(prisma, {
      type: "USER_ACTION",
      description: `Inspection "${existing.name}" deleted`,
      siteId: existing.plot.siteId,
      plotId: existing.plotId,
      userId: session.user.id,
      detail: { inspectionId: id },
    }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete inspection");
  }
}
