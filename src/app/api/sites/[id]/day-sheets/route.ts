import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/day-sheets?date=YYYY-MM-DD
// Returns work assignments grouped by contractor/assignee for the given date
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const dateParam = req.nextUrl.searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : getServerCurrentDate(req);
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Get all jobs active on the target date (started before/on date, not ended before date)
  const jobs = await prisma.job.findMany({
    where: {
      plot: { siteId: id },
      OR: [
        // Jobs explicitly active on this date
        {
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
          status: { not: "COMPLETED" },
        },
        // In-progress jobs with no end date
        {
          status: "IN_PROGRESS",
          startDate: { lte: dayEnd },
          endDate: null,
        },
        // Jobs starting today
        {
          startDate: { gte: dayStart, lte: dayEnd },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      description: true,
      plot: {
        select: {
          plotNumber: true,
          name: true,
          houseType: true,
        },
      },
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
      contractors: {
        include: {
          contact: {
            select: { id: true, name: true, company: true, phone: true, email: true },
          },
        },
      },
      orders: {
        where: {
          expectedDeliveryDate: { gte: dayStart, lte: dayEnd },
          status: "ORDERED",
        },
        select: {
          id: true,
          itemsDescription: true,
          supplier: { select: { name: true } },
          expectedDeliveryDate: true,
        },
      },
    },
    orderBy: [
      { plot: { plotNumber: "asc" } },
      { sortOrder: "asc" },
    ],
  });

  // Group by contractor
  const contractorMap: Record<
    string,
    {
      contractor: { id: string; name: string; company: string | null; phone: string | null; email: string | null };
      jobs: typeof formattedJobs;
    }
  > = {};

  // Group by assigned user (for staff without contractor records)
  const assigneeMap: Record<
    string,
    {
      assignee: { id: string; name: string; email: string; role: string };
      jobs: typeof formattedJobs;
    }
  > = {};

  const unassigned: typeof formattedJobs = [];

  const formattedJobs = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    description: j.description,
    startDate: j.startDate?.toISOString() ?? null,
    endDate: j.endDate?.toISOString() ?? null,
    plot: j.plot,
    deliveries: j.orders.map((o) => ({
      id: o.id,
      items: o.itemsDescription,
      supplier: o.supplier.name,
      expectedDate: o.expectedDeliveryDate?.toISOString() ?? null,
    })),
  }));

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const formatted = formattedJobs[i];

    if (job.contractors.length > 0) {
      for (const jc of job.contractors) {
        const key = jc.contact.id;
        if (!contractorMap[key]) {
          contractorMap[key] = {
            contractor: jc.contact,
            jobs: [],
          };
        }
        contractorMap[key].jobs.push(formatted);
      }
    } else if (job.assignedTo) {
      const key = job.assignedTo.id;
      if (!assigneeMap[key]) {
        assigneeMap[key] = {
          assignee: job.assignedTo,
          jobs: [],
        };
      }
      assigneeMap[key].jobs.push(formatted);
    } else {
      unassigned.push(formatted);
    }
  }

  return NextResponse.json({
    date: dayStart.toISOString(),
    siteId: id,
    contractorSheets: Object.values(contractorMap),
    assigneeSheets: Object.values(assigneeMap),
    unassignedJobs: unassigned,
  });
}
