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

  // Recalculate the PARENT'S endWeek only.
  //
  // SSOT model (May 2026 audit): durationDays + sortOrder is the canonical
  // source for sub-job layout. The Timeline Preview reads those fields
  // directly and computes day-level positions on the fly. We deliberately
  // STOP writing per-child startWeek/endWeek here — those writes used to
  // cause drift (V1: collapsed days to 1 week; V2: each child wasted a
  // grid week; V3: shared weeks but still redundant). Less data, fewer
  // ways for it to disagree.
  //
  // Apply-time cascade in src/lib/apply-template-helpers.ts already reads
  // durationDays + sortOrder, never per-child startWeek/endWeek for
  // hierarchical templates. Legacy flat (no-children) templates aren't
  // affected by this endpoint. Safe to drop.
  const totalDays = parent.children.reduce((acc, c) => {
    const d =
      c.durationDays && c.durationDays > 0
        ? c.durationDays
        : c.durationWeeks && c.durationWeeks > 0
          ? c.durationWeeks * 5
          : 5;
    return acc + d;
  }, 0);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 5));

  try {
    await prisma.templateJob.update({
      where: { id: jobId },
      data: { endWeek: parent.startWeek + totalWeeks - 1 },
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
