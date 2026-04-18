import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/calendar?month=YYYY-MM
// Returns jobs, deliveries, and rained-off days for the calendar view
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const monthParam = req.nextUrl.searchParams.get("month");
  const targetDate = monthParam ? new Date(`${monthParam}-01`) : getServerCurrentDate(req);

  // Expand range to include surrounding months for events that span
  const rangeStart = startOfMonth(subMonths(targetDate, 0));
  const rangeEnd = endOfMonth(addMonths(targetDate, 0));

  const [jobs, deliveries, rainedOffDays, ordersToPlace] = await Promise.all([
    // Jobs with dates in range
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        OR: [
          { startDate: { gte: rangeStart, lte: rangeEnd } },
          { endDate: { gte: rangeStart, lte: rangeEnd } },
          // Jobs spanning the entire range
          {
            startDate: { lte: rangeStart },
            endDate: { gte: rangeEnd },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        weatherAffected: true,
        signedOffAt: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          include: {
            contact: { select: { name: true, company: true } },
          },
          take: 1,
        },
      },
      orderBy: { startDate: "asc" },
    }),

    // Deliveries in range (ORDERED with expected delivery date)
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        OR: [
          { expectedDeliveryDate: { gte: rangeStart, lte: rangeEnd } },
          { deliveredDate: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      select: {
        id: true,
        itemsDescription: true,
        status: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        supplier: { select: { name: true, contactEmail: true } },
        job: {
          select: {
            name: true,
            plot: { select: { plotNumber: true, name: true } },
          },
        },
      },
    }),

    // Rained-off days in range
    prisma.rainedOffDay.findMany({
      where: {
        siteId: id,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true, type: true, note: true },
    }),

    // Orders to place (PENDING with dateOfOrder in range)
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: "PENDING",
        dateOfOrder: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        itemsDescription: true,
        status: true,
        dateOfOrder: true,
        supplier: { select: { name: true, contactEmail: true } },
        job: {
          select: {
            name: true,
            plot: { select: { plotNumber: true, name: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    month: monthParam || targetDate.toISOString().slice(0, 7),
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      startDate: j.startDate?.toISOString() ?? null,
      endDate: j.endDate?.toISOString() ?? null,
      weatherAffected: j.weatherAffected,
      signedOff: !!j.signedOffAt,
      plot: j.plot,
      assignee: j.assignedTo?.name ?? j.contractors[0]?.contact?.company ?? j.contractors[0]?.contact?.name ?? null,
    })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      items: d.itemsDescription,
      status: d.status,
      expectedDate: d.expectedDeliveryDate?.toISOString() ?? null,
      deliveredDate: d.deliveredDate?.toISOString() ?? null,
      supplier: d.supplier.name,
      supplierEmail: d.supplier.contactEmail ?? null,
      job: d.job?.name ?? "",
      plot: d.job?.plot ?? { plotNumber: null, name: "" },
    })),
    ordersToPlace: ordersToPlace.map((o) => ({
      id: o.id,
      items: o.itemsDescription,
      dateOfOrder: o.dateOfOrder.toISOString(),
      supplier: o.supplier.name,
      supplierEmail: o.supplier.contactEmail ?? null,
      job: o.job?.name ?? "",
      plot: o.job?.plot ?? { plotNumber: null, name: "" },
    })),
    rainedOffDays: rainedOffDays.map((r) => ({
      date: r.date.toISOString(),
      type: r.type,
      note: r.note,
    })),
  });
}
