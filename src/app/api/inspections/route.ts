import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { getUserSiteIds, canAccessSite } from "@/lib/site-access";
import { computeInspectionScheduledDate } from "@/lib/inspection-dates";
import { logEvent } from "@/lib/event-log";
import type { InspectionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_TYPES: InspectionType[] = ["NHBC", "BUILDING_CONTROL", "WARRANTY_CML", "INTERNAL_QA", "OTHER"];

// (Jun 2026 R30) Same-calendar-day comparison for the booking-mismatch
// flag. Compares the UTC date parts, matching how Inspection dates are
// stored (date-only DateTimes at UTC midnight); a mismatch means the
// booked day and the scheduled day have genuinely diverged.
function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// GET /api/inspections — cross-site list scoped to accessible sites.
// Filters: ?status= , ?siteId= , ?plotId= , ?open=1 (not PASSED).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "VIEW_INSPECTIONS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const siteIds = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const siteId = searchParams.get("siteId");
  const plotId = searchParams.get("plotId");
  const openOnly = searchParams.get("open") === "1";

  // Effective site filter = intersection of access list and any ?siteId.
  // null siteIds = admin (no access restriction).
  let effectiveSiteIds: string[] | null = siteIds;
  if (siteId) {
    if (siteIds === null) effectiveSiteIds = [siteId];
    else effectiveSiteIds = siteIds.includes(siteId) ? [siteId] : ["__none__"];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (effectiveSiteIds !== null) where.plot = { siteId: { in: effectiveSiteIds } };
  if (plotId) where.plotId = plotId;
  if (status) where.status = status;
  else if (openOnly) where.status = { not: "PASSED" };

  const inspections = await prisma.inspection.findMany({
    where,
    orderBy: [{ scheduledDate: "asc" }],
    include: {
      plot: { select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } } },
      anchorJob: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true, company: true } },
      certificate: { select: { id: true, name: true, url: true } },
      _count: { select: { snags: true, ncrs: true } },
    },
  });

  // (Jun 2026 R30) Booking-mismatch flag — a BOOKED hold-point whose
  // booked day no longer lands on the (recomputed) scheduled day. The
  // schedule shifts under cascades; the booking doesn't auto-follow, so a
  // contractor could turn up on a day with no crew. We surface the flag
  // (an amber "rebook or confirm" chip on the list + Brief) WITHOUT
  // auto-clearing the booking — the manager decides to rebook or confirm.
  const withMismatch = inspections.map((i) => ({
    ...i,
    bookingMismatch:
      i.status === "BOOKED" &&
      i.bookedDate != null &&
      !sameCalendarDay(i.scheduledDate, i.bookedDate),
  }));
  return NextResponse.json(withMismatch);
}

// POST /api/inspections — manual create (gate MANAGE_INSPECTIONS).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "MANAGE_INSPECTIONS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { plotId, type, name, anchorJobId, anchorEdge, offsetDays, bookingLeadWeeks, scheduledDate, inspectorContactId, isBlocking, notes } = body;

  if (!plotId || !name) return NextResponse.json({ error: "plotId and name are required" }, { status: 400 });
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const plot = await prisma.plot.findUnique({ where: { id: plotId }, select: { siteId: true } });
  if (!plot) return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))) {
    return NextResponse.json({ error: "No access to this site" }, { status: 403 });
  }

  // Date: from the anchor job if given, else an explicit scheduledDate.
  let sched: Date | null = null;
  const edge = anchorEdge === "END" ? "END" : "START";
  if (anchorJobId) {
    const job = await prisma.job.findUnique({ where: { id: anchorJobId }, select: { plotId: true, startDate: true, endDate: true } });
    if (!job || job.plotId !== plotId) return NextResponse.json({ error: "Anchor job must be on this plot" }, { status: 400 });
    sched = computeInspectionScheduledDate(job, edge, Number(offsetDays) || 0);
  } else if (scheduledDate) {
    sched = new Date(scheduledDate);
  }
  if (!sched) return NextResponse.json({ error: "Provide an anchor job (with a date) or a scheduledDate" }, { status: 400 });

  try {
    const created = await prisma.inspection.create({
      data: {
        plotId,
        type,
        name: String(name).trim(),
        status: "SCHEDULED",
        anchorJobId: anchorJobId || null,
        anchorEdge: edge,
        offsetDays: Number(offsetDays) || 0,
        bookingLeadWeeks: bookingLeadWeeks != null ? Math.trunc(Number(bookingLeadWeeks)) : null,
        scheduledDate: sched,
        inspectorContactId: inspectorContactId || null,
        // (Jun 2026 D4) Manual-add parity with the template dialog —
        // hard-blocker flag + "what to check" notes.
        isBlocking: Boolean(isBlocking),
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      },
    });
    await logEvent(prisma, { type: "INSPECTION_SCHEDULED", description: `Inspection "${created.name}" added`, siteId: plot.siteId, plotId, jobId: anchorJobId || null, userId: session.user.id, detail: { inspectionId: created.id } }).catch(() => {});
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create inspection");
  }
}
