import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlotScheduleStatus } from "@/lib/schedule";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/plot-schedules
 * Lightweight per-plot schedule status — used by multiple views for traffic lights.
 */
export async function GET(
  _req: NextRequest,
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

  const plots = await prisma.plot.findMany({
    where: { siteId: id },
    select: {
      id: true,
      plotNumber: true,
      awaitingRestart: true,
      jobs: {
        // (Jun 2026 audit) Leaf jobs only. Parent stage rows sort before
        // their children, so getPlotScheduleStatus's "first non-COMPLETED
        // job" landed on the current stage's PARENT — whose startDate is
        // min(children), so when the active sub-job slips but an earlier
        // sibling started on time, daysDeviation read 0 and the traffic
        // light showed "On track" for a plot genuinely behind.
        where: { children: { none: {} } },
        select: {
          status: true,
          sortOrder: true,
          startDate: true,
          originalStartDate: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  const result = plots.map((plot) => {
    const { status, daysDeviation } = getPlotScheduleStatus(
      plot.jobs,
      plot.awaitingRestart
    );
    return {
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      status,
      daysDeviation,
      awaitingRestart: plot.awaitingRestart,
    };
  });

  return NextResponse.json(result);
}
