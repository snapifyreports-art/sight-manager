import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/contractor-share/[token]/request-signoff
 * Body: { jobId: string }
 *
 * Contractor-side "request sign-off" — no login, validated by the share
 * token which is JWT-signed with { contactId, siteId, exp }. The job
 * being flagged must belong to the contact + site in the token.
 *
 * Sets job.signOffRequested = true. Site manager sees this flag on the
 * Contractor Comms card (already present there) and when they next open
 * the job.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const payload = verifyContractorToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired share link" }, { status: 401 });
    }

    const body = await req.json();
    const { jobId } = body;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // Verify the job belongs to this contractor on this site.
    const assignment = await prisma.jobContractor.findFirst({
      where: {
        jobId,
        contactId: payload.contactId,
        job: { plot: { siteId: payload.siteId } },
      },
      select: { id: true, job: { select: { id: true, name: true, plotId: true } } },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "Job not found or not assigned to you on this site" },
        { status: 404 }
      );
    }

    // Sign-off requests are tracked as JobAction rows (action="request_signoff"),
    // not as a column on Job. Matches the existing pattern used by
    // /api/jobs/[id]/request-signoff. Skip if already requested.
    const existing = await prisma.jobAction.findFirst({
      where: { jobId, action: "request_signoff" },
      select: { id: true },
    });

    if (!existing) {
      // JobAction requires a userId. For contractor-share-driven requests
      // we don't have one, so attribute it to the site's creator (falling
      // back to the first user). This is the same compromise used by
      // other token-authenticated writes like snag sign-off.
      const site = await prisma.site.findUnique({
        where: { id: payload.siteId },
        select: { createdById: true },
      });
      const userId = site?.createdById;
      if (!userId) {
        return NextResponse.json({ error: "Site owner not found" }, { status: 500 });
      }
      await prisma.jobAction.create({
        data: {
          jobId,
          userId,
          action: "request_signoff",
          notes: "Requested by contractor via share link",
        },
      });
    }

    // Log event so the site manager can see who requested it + when.
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Sign-off requested by contractor (via share link)`,
        siteId: payload.siteId,
        jobId,
        plotId: assignment.job.plotId,
      },
    }).catch(() => { /* non-fatal */ });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to record sign-off request");
  }
}
