import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude } from "@/lib/template-includes";

// POST /api/plot-templates/[id]/jobs/[jobId]/split — convert flat job into a stage with sub-jobs
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;
  const body = await request.json();
  const { subJobs } = body as {
    subJobs: Array<{ name: string; code: string; duration: number }>;
  };

  if (!subJobs || !Array.isArray(subJobs) || subJobs.length === 0) {
    return NextResponse.json(
      { error: "At least one sub-job is required" },
      { status: 400 }
    );
  }

  // Verify the job exists and is a top-level job (not already a child)
  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id, parentId: null },
    include: { children: true },
  });

  if (!job) {
    return NextResponse.json(
      { error: "Template job not found or is already a child" },
      { status: 404 }
    );
  }

  if (job.children.length > 0) {
    return NextResponse.json(
      { error: "Job already has sub-jobs" },
      { status: 400 }
    );
  }

  // Calculate sub-job weeks (sequential from parent's startWeek)
  let currentWeek = job.startWeek;
  const subJobsWithWeeks = subJobs.map((sj, idx) => {
    const startWeek = currentWeek;
    const endWeek = startWeek + sj.duration - 1;
    currentWeek = endWeek + 1;
    return { ...sj, startWeek, endWeek, sortOrder: idx };
  });

  const parentEndWeek = subJobsWithWeeks[subJobsWithWeeks.length - 1].endWeek;

  // Create children and update parent in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update parent's endWeek to span all children
    await tx.templateJob.update({
      where: { id: jobId },
      data: {
        endWeek: parentEndWeek,
        // Clear description since it's now a stage header
        description: null,
      },
    });

    // Create sub-jobs
    for (const sj of subJobsWithWeeks) {
      await tx.templateJob.create({
        data: {
          templateId: id,
          parentId: jobId,
          name: sj.name.trim(),
          stageCode: sj.code.trim(),
          sortOrder: sj.sortOrder,
          startWeek: sj.startWeek,
          endWeek: sj.endWeek,
          durationWeeks: sj.duration,
        },
      });
    }

    // Return updated template
    return tx.plotTemplate.findUnique({
      where: { id },
      include: {
        jobs: templateJobsInclude,
      },
    });
  });

  return NextResponse.json(result);
}
