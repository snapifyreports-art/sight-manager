import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { canAccessSite } from "@/lib/site-access";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

// (May 2026 audit #1) Helper used by GET + POST below to check that the
// caller has access to the plot's owning site. Returns either the plot
// (with siteId loaded) or a 403/404 response.
async function authorisePlot(plotId: string, session: { user: { id: string; role?: string } }) {
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    include: { site: { select: { id: true, name: true, assignedToId: true } } },
  });
  if (!plot) {
    return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      plot.site.id,
    ))
  ) {
    return {
      error: NextResponse.json(
        { error: "You do not have access to this site" },
        { status: 403 },
      ),
    };
  }
  return { plot };
}

// GET /api/plots/[id]/jobs — list all jobs for a plot
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: plotId } = await params;

  const result = await authorisePlot(plotId, session);
  if ("error" in result) return result.error;

  const jobs = await prisma.job.findMany({
    where: { plotId },
    select: {
      id: true,
      name: true,
      status: true,
      parentStage: true,
      sortOrder: true,
      contractors: {
        select: { contact: { select: { id: true, name: true, company: true, email: true } } },
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(jobs);
}

// POST /api/plots/[id]/jobs — create a job in a plot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (May 2026 pattern sweep) Mirror /api/jobs POST — EDIT_PROGRAMME.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to create jobs" },
      { status: 403 },
    );
  }

  const { id: plotId } = await params;
  const body = await request.json();
  const { name, description, assignedToId, startDate, endDate } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Job name is required" },
      { status: 400 }
    );
  }

  // Verify plot + caller's site access in one go (May 2026 audit #1).
  const result = await authorisePlot(plotId, session);
  if ("error" in result) return result.error;
  const plot = result.plot;

  // Inherit assignedToId from site if not explicitly provided
  const resolvedAssignedToId = assignedToId || plot.site.assignedToId || null;

  // (#13/#14) originalStartDate/EndDate are NOT NULL — fall back to
  // the planned date if provided, else creation time so the row stays
  // in valid state even for unscheduled jobs.
  const now = new Date();
  const startDateD = startDate ? new Date(startDate) : null;
  const endDateD = endDate ? new Date(endDate) : null;

  try {
    const job = await prisma.job.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        plotId,
        assignedToId: resolvedAssignedToId,
        startDate: startDateD,
        endDate: endDateD,
        originalStartDate: startDateD ?? now,
        originalEndDate: endDateD ?? now,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    // Log the event.
    // (May 2026 Story pass) Was mis-typed JOB_STARTED — this is a job
    // *creation*, not a start. USER_ACTION matches POST /api/jobs so
    // the Story doesn't show a phantom "started" the job never had.
    await logEvent(prisma, {
      type: "USER_ACTION",
      description: `Job "${job.name}" was created in plot "${plot.name}" on site "${plot.site.name}"`,
      siteId: plot.site.id,
      plotId: plot.id,
      jobId: job.id,
      userId: session.user.id,
      detail: { jobName: job.name, action: "created" },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create job");
  }
}
