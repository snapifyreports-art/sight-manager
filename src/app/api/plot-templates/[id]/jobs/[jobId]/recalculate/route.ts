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

  // Recalculate: sub-jobs are sequential starting from parent's startWeek
  let currentWeek = parent.startWeek;

  try {
    await prisma.$transaction(async (tx) => {
      for (const child of parent.children) {
        const duration = child.durationWeeks ?? 1;
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
