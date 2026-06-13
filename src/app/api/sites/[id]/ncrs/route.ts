import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";
import { nextRef } from "@/lib/ref-sequence";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #178) NCR CRUD for a site.
 * GET — list, newest-first.
 * POST — create. body: { title, description, plotId?, jobId?,
 *   contactId?, rootCause?, correctiveAction? }
 *
 * The ref field auto-generates as "NCR-NNN" — max existing suffix + 1
 * (Jun 2026 audit: was count + 1, which minted duplicate refs after any
 * delete).
 */

async function authorise(siteId: string, requiredPermission?: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (
    requiredPermission &&
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      requiredPermission,
    )
  ) {
    return {
      error: NextResponse.json(
        { error: `You do not have permission (${requiredPermission})` },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // (Jun 2026 Wave-4 D9) Reading NCRs now requires VIEW_COMPLIANCE — they
  // carry root-cause / liability detail, not general site data.
  const a = await authorise(id, "VIEW_COMPLIANCE");
  if ("error" in a) return a.error;

  const ncrs = await prisma.nCR.findMany({
    where: { siteId: id },
    orderBy: [{ raisedAt: "desc" }, { id: "desc" }],
    take: 500,
    include: {
      plot: { select: { id: true, name: true, plotNumber: true } },
      job: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, company: true } },
      // (Jun 2026 S6) Reverse-link — NCRs raised at an inspection
      // sign-off show a "from inspection" chip back to the source.
      inspection: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(ncrs);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // (Jun 2026 Wave-4 D9) Raising an NCR now requires MANAGE_COMPLIANCE.
  const a = await authorise(id, "MANAGE_COMPLIANCE");
  if ("error" in a) return a.error;

  const body = await req.json();
  if (!body?.title?.trim() || !body?.description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 },
    );
  }

  const existingRefs = await prisma.nCR.findMany({
    where: { siteId: id },
    select: { ref: true },
  });
  const ref = nextRef("NCR", existingRefs.map((r) => r.ref));

  try {
    const ncr = await prisma.nCR.create({
      data: {
        siteId: id,
        plotId: body.plotId || null,
        jobId: body.jobId || null,
        contactId: body.contactId || null,
        ref,
        title: body.title.trim(),
        description: body.description.trim(),
        rootCause: body.rootCause || null,
        correctiveAction: body.correctiveAction || null,
        raisedById: a.session.user.id,
      },
    });
    await logEvent(prisma, {
      // (Jun 2026 Wave-4 S10) Dedicated Site Log category for NCRs.
      type: "NCR_RAISED",
      siteId: id,
      plotId: body.plotId || null,
      jobId: body.jobId || null,
      userId: a.session.user.id,
      description: `${ref} raised: "${ncr.title}"`,
      detail: { ncrId: ncr.id, ref },
    });
    return NextResponse.json(ncr, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create NCR");
  }
}
