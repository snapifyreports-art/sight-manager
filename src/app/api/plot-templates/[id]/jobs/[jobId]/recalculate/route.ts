import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, variantJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import { resequenceTopLevelStages } from "@/lib/template-pack-children";
import { sessionHasPermission } from "@/lib/permissions";

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
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to manage templates" },
      { status: 403 },
    );
  }

  const { id, jobId } = await params;

  // Fetch the parent job with its children. Capture variantId so we can
  // scope the resequence to the parent's own scope (base or variant).
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
    // Transaction timeout: the default 5s isn't enough when a template
    // has 10+ stages with children — every stage's children get
    // re-packed (1 update each), every stage's startWeek/endWeek gets
    // rewritten, and the pooled connection latency compounds. Bumped
    // to 30s so the resequence can complete on big templates. Without
    // this, the transaction silently rolls back and the user sees
    // stale cached startWeek/endWeek (Keith reported May 2026).
    await prisma.$transaction(
      async (tx) => {
        // We can't call packChildrenAndUpdateParent then resequence as
        // separate steps — the resequence rewrites every stage's
        // startWeek anyway, and re-packs each stage's children inside
        // its new window. So just trigger the full re-sequence scoped
        // to the parent's variant (or base); the parent gets handled
        // in the loop.
        await resequenceTopLevelStages(tx, id, parent.variantId);
      },
      { timeout: 30_000 },
    );

    // Return updated template (or variant) so the client can swap it in.
    if (parent.variantId) {
      const variant = await prisma.templateVariant.findUnique({
        where: { id: parent.variantId },
      });
      const jobs = await prisma.templateJob.findMany(
        variantJobsInclude(parent.variantId),
      );
      const shaped = variant
        ? {
            id: variant.id,
            templateId: id,
            name: variant.name,
            description: variant.description,
            typeLabel: null,
            isDraft: false,
            isVariant: true,
            createdAt: variant.createdAt,
            updatedAt: variant.updatedAt,
            jobs,
            variants: [],
          }
        : null;
      return NextResponse.json(
        shaped ? normaliseTemplateParentDates(shaped) : shaped,
      );
    }
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
