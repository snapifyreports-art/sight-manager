import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import { resequenceTopLevelStages } from "@/lib/template-pack-children";

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
  // and ALSO re-sequence all top-level sibling stages so they sit
  // end-to-end with no gaps. Without that re-sequence, shrinking a
  // stage's children left a gap in the Timeline (Keith caught this on
  // SMOKE_TEST — Simple Semi: Groundworks ended week 4, Brickwork
  // didn't slide back from week 6).
  try {
    await prisma.$transaction(async (tx) => {
      // We can't call packChildrenAndUpdateParent then resequence as
      // separate steps — the resequence rewrites every stage's
      // startWeek anyway, and re-packs each stage's children inside
      // its new window. So just trigger the full template re-sequence;
      // the parent we were called for gets handled in the loop.
      await resequenceTopLevelStages(tx, id);
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
