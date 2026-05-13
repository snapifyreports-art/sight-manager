import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { differenceInWorkingDays } from "@/lib/working-days";

// (May 2026 audit B-P1-6) Walkthrough status copy switched from
// calendar-days to working-days arithmetic for the "N days behind"
// / "N days ahead" copy. Matches the rest of the app.

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
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
          orders: {
            select: { id: true, status: true, expectedDeliveryDate: true, supplier: { select: { name: true } } },
          },
          parentId: true,
          parentStage: true,
          stageCode: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      snags: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true, description: true, priority: true, status: true, location: true },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  // Sort plots numerically by plotNumber (string "10" should come after "9", not after "1")
  plots.sort((a, b) => {
    const numA = parseInt(a.plotNumber ?? "", 10);
    const numB = parseInt(b.plotNumber ?? "", 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return (a.plotNumber ?? "").localeCompare(b.plotNumber ?? "");
  });

  const walkthroughPlots = plots.map((plot) => {
    // Use real parentId relation when available; fall back to parentStage string for legacy jobs
    const jobsWithChildrenIds = new Set(
      plot.jobs.filter((j) => j.parentId).map((j) => j.parentId!)
    );
    // Actionable jobs are LEAVES: they have no children themselves
    const actionableJobs = plot.jobs.filter((j) => !jobsWithChildrenIds.has(j.id));

    // Counts on LEAVES only (parents are derived rollups)
    const totalJobs = actionableJobs.length;
    const completedJobs = actionableJobs.filter((j) => j.status === "COMPLETED").length;
    const inProgressJobs = actionableJobs.filter((j) => j.status === "IN_PROGRESS").length;
    const progressPercent =
      totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
    // Sort by start date for chronological order
    const sortedActionable = [...actionableJobs].sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.getTime() - b.startDate.getTime();
    });

    // Current actionable job: first IN_PROGRESS sub-job, else first NOT_STARTED sub-job
    const currentJob =
      sortedActionable.find((j) => j.status === "IN_PROGRESS") ||
      sortedActionable.find((j) => j.status === "NOT_STARTED") ||
      null;

    // Parent stage context (for display) — use real parentId relation
    const parentStageJob = currentJob?.parentId
      ? plot.jobs.find((p) => p.id === currentJob.parentId) ?? null
      : null;

    // Next job: first NOT_STARTED sub-job after current by start date
    const nextJob = currentJob
      ? sortedActionable.find(
          (j) =>
            j.startDate && currentJob.startDate &&
            j.startDate > currentJob.startDate && j.status === "NOT_STARTED"
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
        const delta = differenceInWorkingDays(today, currentJob.endDate);
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
        const delta = differenceInWorkingDays(today, currentJob.startDate);
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
      inProgressJobs,
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
            parentStageName: parentStageJob?.name ?? null,
            orders: currentJob.orders.map((o) => ({ id: o.id, status: o.status, expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null, supplier: { name: o.supplier.name } })),
          }
        : null,
      nextJob: nextJob
        ? {
            id: nextJob.id,
            name: nextJob.name,
            status: nextJob.status,
            startDate: nextJob.startDate?.toISOString() ?? null,
            endDate: nextJob.endDate?.toISOString() ?? null,
            orders: nextJob.orders.map((o) => ({ id: o.id, status: o.status, expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null, supplier: { name: o.supplier.name } })),
          }
        : null,
      openSnags: plot.snags.length,
      snagsList: plot.snags.map((s) => ({
        id: s.id,
        description: s.description,
        priority: s.priority,
        status: s.status,
        location: s.location,
      })),
    };
  });

  return NextResponse.json({
    siteName: site.name,
    siteStatus: site.status,
    plots: walkthroughPlots,
  });
}
