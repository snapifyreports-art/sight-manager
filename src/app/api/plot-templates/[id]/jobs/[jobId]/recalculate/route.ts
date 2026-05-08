import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import { packChildrenAndUpdateParent } from "@/lib/template-pack-children";

export const dynamic = "force-dynamic";

// POST /api/plot-templates/[id]/jobs/[jobId]/recalculate
// Recalculates sibling sub-job weeks after a duration change
// jobId should be the PARENT stage ID
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;

  // Fetch the parent job with its children
  const parent = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!parent) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  if (parent.children.length === 0) {
    return NextResponse.json(
      { error: "Job has no children to recalculate" },
      { status: 400 }
    );
  }

  // SSOT model: durationDays + sortOrder is canonical. We REWRITE each
  // child's startWeek/endWeek + the parent's endWeek as a derived cache,
  // computed from the canonical fields by `packChildrenAndUpdateParent`.
  //
  // History: an earlier version of this code (commit c3519ac) tried to
  // skip per-child writes entirely on the assumption "the Timeline reads
  // durationDays + sortOrder directly anyway". That was right for the
  // Timeline but broke other readers — order-dialog dropdowns, collapsed-
  // stage dot positioning, server-side offset derivation in
  // template-order-offsets.ts, and normaliseTemplateParentDates() — all
  // of which consult `child.startWeek` directly. Re-introducing the
  // writes as a fresh-from-canonical cache.
  try {
    await prisma.$transaction(async (tx) => {
      await packChildrenAndUpdateParent(tx, parent, parent.children);
    });

    // Return updated template
    const template = await prisma.plotTemplate.findUnique({
      where: { id },
      include: {
        jobs: templateJobsInclude,
      },
    });

    return NextResponse.json(template ? normaliseTemplateParentDates(template) : template);
  } catch (err) {
    return apiError(err, "Failed to recalculate job");
  }
}
