import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { differenceInCalendarDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const today = getServerCurrentDate(req);

  const site = await prisma.site.findUnique({
    where: { id },
    select: { name: true, status: true },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const plots = await prisma.plot.findMany({
    where: { siteId: id },
    select: {
      id: true,
      plotNumber: true,
      name: true,
      houseType: true,
      buildCompletePercent: true,
      jobs: {
        select: {
          id: true,
          name: true,
          status: true,
          sortOrder: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          signOffNotes: true,
          assignedTo: { select: { name: true } },
          contractors: {
            select: { contact: { select: { name: true, company: true } } },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          _count: { select: { photos: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      snags: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  const walkthroughPlots = plots.map((plot) => {
    const totalJobs = plot.jobs.length;
    const completedJobs = plot.jobs.filter((j) => j.status === "COMPLETED").length;
    const progressPercent =
      totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

    // Current job: first IN_PROGRESS, else first NOT_STARTED
    const currentJob =
      plot.jobs.find((j) => j.status === "IN_PROGRESS") ||
      plot.jobs.find((j) => j.status === "NOT_STARTED") ||
      null;

    // Next job: first NOT_STARTED after current's sortOrder
    const nextJob = currentJob
      ? plot.jobs.find(
          (j) =>
            j.sortOrder > currentJob.sortOrder && j.status === "NOT_STARTED"
        ) ?? null
      : null;

    // Schedule status
    let scheduleStatus: "ahead" | "on_track" | "behind" | "not_started" | "complete" =
      "not_started";
    let scheduleDays = 0;

    if (completedJobs === totalJobs && totalJobs > 0) {
      scheduleStatus = "complete";
    } else if (currentJob) {
      if (currentJob.status === "IN_PROGRESS" && currentJob.endDate) {
        const delta = differenceInCalendarDays(today, currentJob.endDate);
        if (delta > 2) {
          scheduleStatus = "behind";
          scheduleDays = delta;
        } else if (delta < -3) {
          scheduleStatus = "ahead";
          scheduleDays = Math.abs(delta);
        } else {
          scheduleStatus = "on_track";
        }
      } else if (currentJob.status === "NOT_STARTED" && currentJob.startDate) {
        const delta = differenceInCalendarDays(today, currentJob.startDate);
        if (delta > 2) {
          scheduleStatus = "behind";
          scheduleDays = delta;
        } else {
          scheduleStatus = "on_track";
        }
      } else {
        scheduleStatus = "on_track";
      }
    }

    const contractor = currentJob?.contractors?.[0]?.contact ?? null;

    return {
      id: plot.id,
      plotNumber: plot.plotNumber,
      plotName: plot.name,
      houseType: plot.houseType,
      totalJobs,
      completedJobs,
      progressPercent,
      scheduleStatus,
      scheduleDays,
      currentJob: currentJob
        ? {
            id: currentJob.id,
            name: currentJob.name,
            status: currentJob.status,
            contractorName: contractor
              ? contractor.company || contractor.name
              : null,
            assignedToName: currentJob.assignedTo?.name ?? null,
            startDate: currentJob.startDate?.toISOString() ?? null,
            endDate: currentJob.endDate?.toISOString() ?? null,
            photoCount: currentJob._count.photos,
            hasSignOffNotes: !!currentJob.signOffNotes,
          }
        : null,
      nextJob: nextJob
        ? {
            id: nextJob.id,
            name: nextJob.name,
            status: nextJob.status,
          }
        : null,
      openSnags: plot.snags.length,
    };
  });

  return NextResponse.json({
    siteName: site.name,
    siteStatus: site.status,
    plots: walkthroughPlots,
  });
}
