import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { isJobEndOverdue, workingDaysEndOverdue } from "@/lib/lateness";

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
      // (#177) Use the cached buildCompletePercent — same field every
      // other view reads, no inline recalculation. The cache is kept
      // current by recomputePlotPercent() on every job mutation.
      buildCompletePercent: true,
      jobs: {
        select: {
          id: true,
          status: true,
          endDate: true,
          // (May 2026 Keith request) Orders on the heatmap — pull each
          // job's orders so we can flag plots with overdue orders
          // (late to send, or ORDERED past expected delivery).
          orders: {
            select: {
              status: true,
              dateOfOrder: true,
              expectedDeliveryDate: true,
              deliveredDate: true,
            },
          },
        },
        // Leaf-only — parent stage rollups would double-count.
        where: { children: { none: {} } },
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
    // (#177) SSOT via isJobEndOverdue — same definition as Daily
    // Brief, Tasks, Dashboard. Previously this was an inline check
    // that subtly diverged.
    const overdueJobs = plot.jobs.filter((j) => isJobEndOverdue(j, today));
    const overdueJobCount = overdueJobs.length;
    // (#177) Working days, not calendar days. Weekends don't make a
    // job more behind; the RAG thresholds are calibrated in working
    // days everywhere else.
    const maxOverdueDays = overdueJobs.reduce((max, j) => {
      const days = workingDaysEndOverdue(j, today);
      return days > max ? days : max;
    }, 0);

    // (May 2026 Keith request) Overdue-order count per plot — PENDING
    // orders past their send date, or ORDERED orders past their
    // expected delivery and not yet received. Surfaced as a badge on
    // the heatmap tile (doesn't drive the RAG colour for now).
    const overdueOrderCount = plot.jobs
      .flatMap((j) => j.orders)
      .filter((o) => {
        if (o.status === "PENDING") return o.dateOfOrder < today;
        if (o.status === "ORDERED" && !o.deliveredDate) {
          return !!o.expectedDeliveryDate && o.expectedDeliveryDate < today;
        }
        return false;
      }).length;

    const calcPercent = plot.buildCompletePercent;
    let ragStatus: "green" | "amber" | "red" | "grey" = "grey";

    const allNotStarted = plot.jobs.every((j) => j.status === "NOT_STARTED");

    // (May 2026 audit B-P2-19) RAG threshold re-tuned for working
    // days. Pre-fix the heatmap kept the old 14-calendar-day cutoff
    // even after #177 flipped maxOverdueDays to working days. 14 WD
    // ≈ 3 weeks elapsed which is way past "red"; 10 WD ≈ 2 weeks is
    // the right border. Amber covers 1-9 WD overdue.
    const RED_WD_THRESHOLD = 10;

    if (totalJobs === 0 || allNotStarted) {
      ragStatus = "grey";
    } else if (completedJobs === totalJobs) {
      ragStatus = "green";
    } else if (maxOverdueDays > RED_WD_THRESHOLD || (calcPercent < 50 && overdueJobCount > 0)) {
      ragStatus = "red";
    } else if ((overdueJobCount > 0 && maxOverdueDays <= RED_WD_THRESHOLD) || (calcPercent >= 50 && calcPercent < 90)) {
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
      overdueOrderCount,
      openSnagCount: plot._count.snags,
      ragStatus,
    };
  });

  return NextResponse.json(heatmapData);
}
