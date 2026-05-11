import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite, getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (May 2026 audit #1) Scope to sites the user can access. Pre-fix
  // this returned every job across every site for any logged-in user.
  const siteIds = await getUserSiteIds(
    session.user.id,
    (session.user as { role: string }).role,
  );

  const jobs = await prisma.job.findMany({
    where: siteIds === null ? {} : { plot: { siteId: { in: siteIds } } },
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      contractors: { include: { contact: { select: { id: true, name: true, company: true } } } },
      _count: { select: { orders: true } },
    },
    // (#168) Chronological by start date — sortOrder as tiebreaker for
    // jobs that share a start date inside a plot.
    orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { plotId, name, description, assignedToId, location, address, startDate, endDate } = body;

  if (!plotId || !name) {
    return NextResponse.json(
      { error: "plotId and name are required" },
      { status: 400 }
    );
  }

  // (May 2026 audit #1) Verify caller can access the target plot's
  // site before creating a job there.
  const plotForCheck = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { siteId: true },
  });
  if (!plotForCheck) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      plotForCheck.siteId,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  // (#13/#14) originalStartDate/EndDate are NOT NULL — fall back to
  // the planned date if provided, else creation time so the row stays
  // in valid state even for unscheduled jobs.
  const now = new Date();
  const startDateD = startDate ? new Date(startDate) : null;
  const endDateD = endDate ? new Date(endDate) : null;

  const job = await prisma.job.create({
    data: {
      plotId,
      name,
      description: description || null,
      assignedToId: assignedToId || null,
      location: location || null,
      address: address || null,
      startDate: startDateD,
      endDate: endDateD,
      originalStartDate: startDateD ?? now,
      originalEndDate: endDateD ?? now,
    },
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      _count: { select: { orders: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Job "${job.name}" was created`,
      siteId: job.plot.siteId,
      plotId: job.plotId,
      jobId: job.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
