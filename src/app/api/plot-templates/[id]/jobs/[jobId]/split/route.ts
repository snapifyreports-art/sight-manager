import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

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
  const { subJobs, orderTarget } = body as {
    subJobs: Array<{ name: string; code: string; duration: number }>;
    // "keep" — leave on parent stage (default)
    // "first" — move to first newly-created sub-job
    // "index:N" — move to the Nth sub-job (0-based)
    // undefined — treated as "keep"
    orderTarget?: "keep" | "first" | `index:${number}`;
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

  try {
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

      // Create sub-jobs and capture their IDs so we can route orders to
      // the requested target.
      const createdSubJobs: Array<{ id: string; sortOrder: number }> = [];
      for (const sj of subJobsWithWeeks) {
        const created = await tx.templateJob.create({
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
        createdSubJobs.push({ id: created.id, sortOrder: sj.sortOrder });
      }

      // Handle existing orders on the parent. Keith's rule (Q5 Apr 2026):
      // ask the user where they go — keep on stage (default), or move to
      // a specific sub-job. Orders never become orphaned; they land
      // SOMEWHERE sensible.
      if (orderTarget && orderTarget !== "keep") {
        let targetSubJobId: string | null = null;
        if (orderTarget === "first") {
          targetSubJobId = createdSubJobs[0]?.id ?? null;
        } else if (orderTarget.startsWith("index:")) {
          const idx = parseInt(orderTarget.slice("index:".length), 10);
          targetSubJobId = createdSubJobs[idx]?.id ?? null;
        }
        if (targetSubJobId) {
          await tx.templateOrder.updateMany({
            where: { templateJobId: jobId },
            data: { templateJobId: targetSubJobId },
          });
        }
      }

      // Return updated template
      return tx.plotTemplate.findUnique({
        where: { id },
        include: {
          jobs: templateJobsInclude,
        },
      });
    });

    return NextResponse.json(result ? normaliseTemplateParentDates(result) : result);
  } catch (err) {
    return apiError(err, "Failed to split job");
  }
}
