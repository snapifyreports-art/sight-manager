import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { calculateCascade } from "@/lib/cascade";
import { differenceInWorkingDays } from "@/lib/working-days";

// (May 2026 audit B-P1-2) Cascade engine uses working-day arithmetic
// internally — using calendar-days here was creating false-positive
// "cascade needed" branches when the actualEnd was within the same
// working week as the planned end but the dates straddled a weekend.

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch the completed job with plot info
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      plot: { include: { site: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // (Jun 2026 security sweep) Site-access check — pre-fix any
  // authenticated user could pass any job id and read cross-site
  // contractor emails, supplier names and order details. Same gate as
  // the sibling jobs/[id]/siblings route.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      job.plot.siteId,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  // Fetch all LEAF jobs on the same plot. (Jun 2026 daily-flow audit)
  // Excluding parent stage rollups — they sort just before their own
  // children, so the "next stage" group would otherwise be the stage
  // header rather than its first real sub-job.
  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, children: { none: {} } },
    orderBy: { sortOrder: "asc" },
  });

  // Find the next sortOrder group (jobs with the next higher sortOrder)
  const nextSortOrder = allPlotJobs
    .filter((j) => j.sortOrder > job.sortOrder)
    .reduce(
      (min, j) => (j.sortOrder < min ? j.sortOrder : min),
      Infinity
    );

  const nextJobs =
    nextSortOrder === Infinity
      ? []
      : allPlotJobs.filter((j) => j.sortOrder === nextSortOrder);

  // For each next job, fetch contractors and pending orders
  const nextJobDetails = await Promise.all(
    nextJobs.map(async (nj) => {
      const contractors = await prisma.jobContractor.findMany({
        where: { jobId: nj.id },
        include: {
          contact: {
            select: { id: true, name: true, email: true, company: true },
          },
        },
      });

      const pendingOrders = await prisma.materialOrder.findMany({
        where: {
          jobId: nj.id,
          status: { notIn: ["DELIVERED", "CANCELLED"] },
        },
        include: {
          supplier: { select: { name: true } },
        },
      });

      return {
        id: nj.id,
        name: nj.name,
        startDate: nj.startDate,
        endDate: nj.endDate,
        status: nj.status,
        sortOrder: nj.sortOrder,
        assignedToId: nj.assignedToId,
        contractors: contractors.map((c) => ({
          contactId: c.contact.id,
          name: c.contact.name,
          email: c.contact.email,
          company: c.contact.company,
        })),
        pendingOrders: pendingOrders.map((o) => ({
          id: o.id,
          supplierName: o.supplier.name,
          status: o.status,
          expectedDeliveryDate: o.expectedDeliveryDate,
          itemsDescription: o.itemsDescription,
        })),
      };
    })
  );

  // Calculate cascade preview if actual end date differs from planned
  let cascade = {
    needed: false,
    deltaDays: 0,
    jobUpdates: [] as Array<{
      jobId: string;
      jobName: string;
      originalStart: Date | null;
      originalEnd: Date | null;
      newStart: Date;
      newEnd: Date;
    }>,
    orderUpdates: [] as Array<{
      orderId: string;
      originalOrderDate: Date;
      originalDeliveryDate: Date | null;
      newOrderDate: Date;
      newDeliveryDate: Date | null;
    }>,
  };

  if (job.actualEndDate && job.endDate) {
    const deltaDays = differenceInWorkingDays(job.actualEndDate, job.endDate);
    if (deltaDays !== 0) {
      const allOrders = await prisma.materialOrder.findMany({
        where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
      });

      const result = calculateCascade(
        id,
        job.actualEndDate,
        allPlotJobs.map((j) => ({
          id: j.id,
          name: j.name,
          startDate: j.startDate,
          endDate: j.endDate,
          sortOrder: j.sortOrder,
        })),
        allOrders.map((o) => ({
          id: o.id,
          jobId: o.jobId,
          dateOfOrder: o.dateOfOrder,
          expectedDeliveryDate: o.expectedDeliveryDate,
        }))
      );

      cascade = {
        needed: true,
        deltaDays: result.deltaDays,
        jobUpdates: result.jobUpdates,
        orderUpdates: result.orderUpdates,
      };
    }
  }

  return NextResponse.json({
    job: {
      id: job.id,
      name: job.name,
      plotName: job.plot.name,
      siteName: job.plot.site.name,
      endDate: job.endDate,
      actualEndDate: job.actualEndDate,
    },
    nextJobs: nextJobDetails,
    cascade: JSON.parse(JSON.stringify(cascade)),
  });
}
