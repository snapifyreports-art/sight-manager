import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #53) Predictive completion for a plot.
 *
 * Derives a "likely finish date" from observed velocity rather than
 * the cascade's planned dates. Useful for spotting plots that are
 * slipping before they hit the overdue threshold.
 *
 * Method:
 *   1. Velocity = (jobs completed in last 30 working days) / 30
 *   2. Remaining work = count of NOT_STARTED + IN_PROGRESS leaf jobs
 *   3. Predicted days remaining = remaining / velocity
 *   4. Predicted completion = today + predicted days remaining
 *
 * Returns null predictedDate when velocity = 0 (no jobs completed
 * recently — can't extrapolate honestly).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const plot = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true },
  });
  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      plot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const jobs = await prisma.job.findMany({
    where: { plotId: id, children: { none: {} } },
    select: {
      status: true,
      endDate: true,
      actualEndDate: true,
    },
  });

  const completedRecently = jobs.filter(
    (j) =>
      j.status === "COMPLETED" &&
      j.actualEndDate &&
      j.actualEndDate.getTime() >= thirtyDaysAgo.getTime(),
  ).length;
  const remaining = jobs.filter(
    (j) => j.status === "NOT_STARTED" || j.status === "IN_PROGRESS",
  ).length;
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;

  const velocity = completedRecently / 30;
  const plannedFinish = jobs
    .map((j) => j.endDate?.getTime())
    .filter((t): t is number => typeof t === "number")
    .reduce((m, t) => Math.max(m, t), 0);

  let predictedDate: string | null = null;
  let predictedDaysRemaining: number | null = null;
  let slippageDays: number | null = null;
  if (velocity > 0 && remaining > 0) {
    predictedDaysRemaining = Math.ceil(remaining / velocity);
    const predicted = new Date(
      Date.now() + predictedDaysRemaining * 24 * 60 * 60 * 1000,
    );
    predictedDate = predicted.toISOString();
    if (plannedFinish > 0) {
      slippageDays = Math.round(
        (predicted.getTime() - plannedFinish) / (24 * 60 * 60 * 1000),
      );
    }
  } else if (velocity === 0 && remaining > 0) {
    // No recent completions but work remaining — flag as stalled.
    predictedDate = null;
  } else if (remaining === 0) {
    // Already done — predicted date is the latest actualEndDate.
    const lastActual = jobs
      .map((j) => j.actualEndDate?.getTime())
      .filter((t): t is number => typeof t === "number")
      .reduce((m, t) => Math.max(m, t), 0);
    if (lastActual > 0) predictedDate = new Date(lastActual).toISOString();
  }

  return NextResponse.json({
    completed,
    remaining,
    completedRecently,
    velocity: Math.round(velocity * 100) / 100,
    plannedFinish: plannedFinish > 0 ? new Date(plannedFinish).toISOString() : null,
    predictedDate,
    predictedDaysRemaining,
    slippageDays,
    stalled: velocity === 0 && remaining > 0,
  });
}
