import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/heatmap — RAG status per plot
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
  today.setHours(0, 0, 0, 0);

  const plots = await prisma.plot.findMany({
    where: { siteId: id },
    select: {
      id: true,
      plotNumber: true,
      name: true,
      houseType: true,
      jobs: {
        select: {
          id: true,
          status: true,
          endDate: true,
        },
      },
      _count: {
        select: {
          snags: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
        },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  const heatmapData = plots.map((plot) => {
    const totalJobs = plot.jobs.length;
    const completedJobs = plot.jobs.filter((j) => j.status === "COMPLETED").length;
    const overdueJobs = plot.jobs.filter(
      (j) =>
        j.endDate &&
        new Date(j.endDate) < today &&
        j.status !== "COMPLETED"
    );
    const overdueJobCount = overdueJobs.length;
    const maxOverdueDays = overdueJobs.reduce((max, j) => {
      const days = differenceInDays(today, new Date(j.endDate!));
      return days > max ? days : max;
    }, 0);

    const calcPercent = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
    let ragStatus: "green" | "amber" | "red" | "grey" = "grey";

    const allNotStarted = plot.jobs.every((j) => j.status === "NOT_STARTED");

    if (totalJobs === 0 || allNotStarted) {
      ragStatus = "grey";
    } else if (completedJobs === totalJobs) {
      ragStatus = "green";
    } else if (maxOverdueDays > 14 || (calcPercent < 50 && overdueJobCount > 0)) {
      ragStatus = "red";
    } else if ((overdueJobCount > 0 && maxOverdueDays <= 14) || (calcPercent >= 50 && calcPercent < 90)) {
      ragStatus = "amber";
    } else if (overdueJobCount === 0 && calcPercent >= 90) {
      ragStatus = "green";
    } else {
      ragStatus = "amber";
    }

    return {
      id: plot.id,
      plotNumber: plot.plotNumber,
      name: plot.name,
      houseType: plot.houseType,
      buildCompletePercent: calcPercent,
      totalJobs,
      completedJobs,
      overdueJobCount,
      maxOverdueDays,
      openSnagCount: plot._count.snags,
      ragStatus,
    };
  });

  return NextResponse.json(heatmapData);
}
