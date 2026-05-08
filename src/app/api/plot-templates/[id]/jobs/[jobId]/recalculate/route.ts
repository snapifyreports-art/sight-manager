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

  // Recalculate: pack sub-jobs by working-day cursor (not by week).
  //
  // History:
  //   - V1 used `durationWeeks ?? 1` → every days-unit child collapsed to a
  //     1-week slot. 20d Foundations rendered as 1 week.
  //   - V2 (earlier today) used `Math.ceil(durationDays / 5)` per child →
  //     fixed the 20d case but six 3-day sub-jobs still ate six grid weeks
  //     because each was forced to a minimum of 1 week. 3+2+3+1+2+3 = 14
  //     working days but the stage span ballooned to 6 weeks.
  //   - V3 (this code) tracks a *day cursor*. Each child's startWeek is the
  //     week containing its day-cursor start, endWeek is the week containing
  //     its day-cursor end. Sub-jobs share weeks freely. The Timeline
  //     component does the day-level horizontal positioning — these
  //     startWeek/endWeek values just keep the bar in the right week column
  //     so legacy renderers don't break.
  let dayCursor = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const child of parent.children) {
        const days =
          child.durationDays && child.durationDays > 0
            ? child.durationDays
            : child.durationWeeks && child.durationWeeks > 0
              ? child.durationWeeks * 5
              : 5;
        const startWeek = parent.startWeek + Math.floor(dayCursor / 5);
        const endWeek =
          parent.startWeek + Math.floor((dayCursor + days - 1) / 5);

        await tx.templateJob.update({
          where: { id: child.id },
          data: { startWeek, endWeek },
        });

        dayCursor += days;
      }

      // Parent span = total days rounded up to whole weeks. Min 1 so an
      // empty parent doesn't end before it starts.
      const totalWeeks = Math.max(1, Math.ceil(dayCursor / 5));
      await tx.templateJob.update({
        where: { id: jobId },
        data: { endWeek: parent.startWeek + totalWeeks - 1 },
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
