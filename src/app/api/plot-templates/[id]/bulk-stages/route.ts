import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UK_HOUSEBUILDING_STAGES } from "@/lib/stage-library";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/plot-templates/[id]/bulk-stages — add multiple predefined stages at once
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { stageCodes, durations: globalDurations } = body as {
    stageCodes: string[];
    durations?: Record<string, number>;
  };

  if (!Array.isArray(stageCodes) || stageCodes.length === 0) {
    return NextResponse.json(
      { error: "stageCodes array is required" },
      { status: 400 }
    );
  }

  // Validate all stage codes
  const stageDefs = stageCodes.map((code) => {
    const def = UK_HOUSEBUILDING_STAGES.find((s) => s.code === code);
    if (!def) throw new Error(`Unknown stage code: ${code}`);
    return def;
  });

  // Verify template exists and get current max sort/week
  const template = await prisma.plotTemplate.findUnique({
    where: { id },
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "desc" },
        take: 1,
        select: { sortOrder: true, endWeek: true },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const lastJob = template.jobs[0];
  let nextSortOrder = lastJob ? lastJob.sortOrder + 1 : 0;
  let nextStartWeek = lastJob ? lastJob.endWeek + 1 : 1;

  try {
    // Create all stages in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      for (const stageDef of stageDefs) {
        const durationOverrides = globalDurations || {};
        const subJobDefs = stageDef.subJobs.map((sj) => ({
          code: sj.code,
          name: sj.name,
          duration: durationOverrides[sj.code] ?? sj.defaultDuration,
        }));

        // Calculate sub-job weeks
        let currentWeek = nextStartWeek;
        const subJobsWithWeeks = subJobDefs.map((sj, idx) => {
          const startWeek = currentWeek;
          const endWeek = startWeek + sj.duration - 1;
          currentWeek = endWeek + 1;
          return { ...sj, startWeek, endWeek, sortOrder: idx };
        });

        const parentEndWeek =
          subJobsWithWeeks[subJobsWithWeeks.length - 1].endWeek;

        // Create parent stage
        const parent = await tx.templateJob.create({
          data: {
            templateId: id,
            name: stageDef.name,
            stageCode: stageDef.code,
            sortOrder: nextSortOrder,
            startWeek: nextStartWeek,
            endWeek: parentEndWeek,
          },
        });

        // Create sub-jobs
        for (const sj of subJobsWithWeeks) {
          await tx.templateJob.create({
            data: {
              templateId: id,
              parentId: parent.id,
              name: sj.name,
              stageCode: sj.code,
              sortOrder: sj.sortOrder,
              startWeek: sj.startWeek,
              endWeek: sj.endWeek,
              durationWeeks: sj.duration,
            },
          });
        }

        // Advance for next stage
        nextSortOrder++;
        nextStartWeek = parentEndWeek + 1;
      }

      // Return updated template
      return tx.plotTemplate.findUnique({
        where: { id },
        include: { jobs: templateJobsInclude },
      });
    });

    return NextResponse.json(result ? normaliseTemplateParentDates(result) : result, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to update template stages");
  }
}
