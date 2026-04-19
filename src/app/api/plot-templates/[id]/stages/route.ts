import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UK_HOUSEBUILDING_STAGES } from "@/lib/stage-library";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/plot-templates/[id]/stages — add a stage with sub-jobs from library
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
  const { stageCode, custom, name, code, subJobs } = body;

  // Verify template exists
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

  // Calculate next sort order and start week from existing top-level jobs
  const lastJob = template.jobs[0];
  const nextSortOrder = lastJob ? lastJob.sortOrder + 1 : 0;
  const nextStartWeek = lastJob ? lastJob.endWeek + 1 : 1;

  let stageName: string;
  let stageCodeValue: string;
  let subJobDefs: Array<{ code: string; name: string; duration: number }>;

  if (custom) {
    // Custom stage
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Stage name is required for custom stages" },
        { status: 400 }
      );
    }
    if (!subJobs || !Array.isArray(subJobs) || subJobs.length === 0) {
      return NextResponse.json(
        { error: "At least one sub-job is required" },
        { status: 400 }
      );
    }
    stageName = name.trim();
    stageCodeValue = code?.trim() || stageName.substring(0, 3).toUpperCase();
    subJobDefs = subJobs.map(
      (sj: { code?: string; name: string; duration?: number }) => ({
        code: sj.code?.trim() || sj.name.substring(0, 3).toUpperCase(),
        name: sj.name.trim(),
        duration: sj.duration ?? 1,
      })
    );
  } else {
    // Predefined stage from library
    const stageDef = UK_HOUSEBUILDING_STAGES.find((s) => s.code === stageCode);
    if (!stageDef) {
      return NextResponse.json(
        { error: `Unknown stage code: ${stageCode}` },
        { status: 400 }
      );
    }
    stageName = stageDef.name;
    stageCodeValue = stageDef.code;

    // Allow duration overrides from request body
    const durationOverrides: Record<string, number> = body.durations || {};
    subJobDefs = stageDef.subJobs.map((sj) => ({
      code: sj.code,
      name: sj.name,
      duration: durationOverrides[sj.code] ?? sj.defaultDuration,
    }));
  }

  // Calculate sub-job weeks (sequential)
  let currentWeek = nextStartWeek;
  const subJobsWithWeeks = subJobDefs.map((sj, idx) => {
    const startWeek = currentWeek;
    const endWeek = startWeek + sj.duration - 1;
    currentWeek = endWeek + 1;
    return { ...sj, startWeek, endWeek, sortOrder: idx };
  });

  const parentEndWeek = subJobsWithWeeks[subJobsWithWeeks.length - 1].endWeek;

  try {
    // Create parent + children in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create parent stage
      const parent = await tx.templateJob.create({
        data: {
          templateId: id,
          name: stageName,
          stageCode: stageCodeValue,
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

      // Return updated template
      return tx.plotTemplate.findUnique({
        where: { id },
        include: {
          jobs: templateJobsInclude,
        },
      });
    });

    return NextResponse.json(result ? normaliseTemplateParentDates(result) : result, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to update stages");
  }
}
