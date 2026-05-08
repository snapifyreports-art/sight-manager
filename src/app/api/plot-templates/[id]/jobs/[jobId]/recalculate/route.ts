import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

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

  // Recalculate: sub-jobs are sequential starting from parent's startWeek.
  //
  // Bug history (May 2026): the inline working-days duration field on the
  // editor sets `durationDays: <N>, durationWeeks: null` and then calls this
  // endpoint. Previously we did `child.durationWeeks ?? 1` which collapsed
  // EVERY days-unit child to a 1-week grid slot — Foundations 20d showed as
  // 1 grid week (Stage Wk 1-4) instead of 4 grid weeks (Stage Wk 1-7). Now
  // we derive grid weeks from durationDays when present so the Timeline
  // Preview matches the actual programme footprint.
  let currentWeek = parent.startWeek;

  try {
    await prisma.$transaction(async (tx) => {
      for (const child of parent.children) {
        // durationDays wins when set — round up to whole grid weeks (we
        // can't display a 0.6-week slot). Falls back to durationWeeks for
        // legacy / week-unit sub-jobs, then 1 as a last resort.
        const duration =
          child.durationDays && child.durationDays > 0
            ? Math.max(1, Math.ceil(child.durationDays / 5))
            : child.durationWeeks && child.durationWeeks > 0
              ? child.durationWeeks
              : 1;
        const startWeek = currentWeek;
        const endWeek = startWeek + duration - 1;
        currentWeek = endWeek + 1;

        await tx.templateJob.update({
          where: { id: child.id },
          data: { startWeek, endWeek },
        });
      }

      // Update parent's endWeek to span all children
      const newParentEndWeek = currentWeek - 1;
      await tx.templateJob.update({
        where: { id: jobId },
        data: { endWeek: newParentEndWeek },
      });
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
