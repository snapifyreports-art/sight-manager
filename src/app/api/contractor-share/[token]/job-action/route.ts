import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { apiError } from "@/lib/api-errors";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * (May 2026 contractor self-service portal) Contractor records a
 * self-attestation against a job: I've started / I've finished / I've
 * added a note. Doesn't change the job's status — that's still the
 * admin's call — but creates a JobAction so the audit trail shows the
 * contractor's self-attestation timestamp.
 *
 * Body: { jobId, action: "confirm_start" | "confirm_complete" | "note",
 *         notes? }
 *
 * Token-auth via verifyContractorToken (same as request-signoff).
 * Job must belong to the contact + site in the token.
 */
const ALLOWED_ACTIONS = ["confirm_start", "confirm_complete", "note"] as const;
type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const payload = verifyContractorToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired share link" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const jobId = typeof body?.jobId === "string" ? body.jobId : null;
    const action = body?.action as AllowedAction | undefined;
    const notes = typeof body?.notes === "string" ? body.notes : null;

    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify the job belongs to this contractor on this site.
    const assignment = await prisma.jobContractor.findFirst({
      where: {
        jobId,
        contactId: payload.contactId,
        job: { plot: { siteId: payload.siteId } },
      },
      select: {
        contact: { select: { name: true, company: true } },
        job: { select: { id: true, name: true, plotId: true } },
      },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "Job not found or not assigned to you on this site" },
        { status: 404 },
      );
    }

    const site = await prisma.site.findUnique({
      where: { id: payload.siteId },
      select: { createdById: true },
    });
    if (!site?.createdById) {
      return NextResponse.json({ error: "Site owner not found" }, { status: 500 });
    }

    // Idempotency for confirm_start / confirm_complete — second tap on
    // the same button shouldn't double-log. Notes always allowed.
    if (action !== "note") {
      const existing = await prisma.jobAction.findFirst({
        where: { jobId, action },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ ok: true, idempotent: true });
      }
    }

    const verb =
      action === "confirm_start"
        ? "confirmed start"
        : action === "confirm_complete"
          ? "confirmed completion"
          : "added a note";
    const contractorLabel =
      assignment.contact.company || assignment.contact.name;

    await prisma.jobAction.create({
      data: {
        jobId,
        userId: site.createdById,
        action,
        notes:
          notes ||
          `${verb} by ${contractorLabel} (via share link)`,
      },
    });

    await logEvent(prisma, {
      type: "USER_ACTION",
      description: `Contractor ${contractorLabel} ${verb}${notes ? `: "${notes.slice(0, 80)}"` : ""}`,
      siteId: payload.siteId,
      jobId,
      plotId: assignment.job.plotId,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to record action");
  }
}
