import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/jobs/[id]/request-signoff
// Creates a sign-off request action — notifies internal team
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      plot: {
        select: { plotNumber: true, name: true, site: { select: { id: true, name: true } } },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.site.id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  if (job.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Only in-progress jobs can request sign-off" },
      { status: 400 }
    );
  }

  // Check if already requested
  const existing = await prisma.jobAction.findFirst({
    where: { jobId: id, action: "request_signoff" },
  });

  if (existing) {
    return NextResponse.json({ alreadyRequested: true });
  }

  try {
    // Create the request action
    await prisma.jobAction.create({
      data: {
        jobId: id,
        userId: session.user.id,
        action: "request_signoff",
        notes: "Sign-off requested by site team",
      },
    });

    // Log event
    const plotLabel = job.plot.plotNumber ? `Plot ${job.plot.plotNumber}` : job.plot.name;
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Sign-off requested for "${job.name}" on ${plotLabel}`,
        siteId: job.plot.site.id,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });

    // Send push notification
    await sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
      title: `Sign-Off Requested — ${job.name}`,
      body: `${plotLabel} on ${job.plot.site.name}: "${job.name}" is ready for sign-off`,
      url: `/jobs/${id}`,
      tag: `signoff-request-${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to request sign-off");
  }
}
