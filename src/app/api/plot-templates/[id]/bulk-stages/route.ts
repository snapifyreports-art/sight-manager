import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UK_HOUSEBUILDING_STAGES } from "@/lib/stage-library";
import { templateJobsInclude, variantJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
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
  const { searchParams } = new URL(request.url);
  // Optional variantId — when set, new stages are scoped to that
  // variant (May 2026 full-fat variants rework). Null = base template.
  const variantId = searchParams.get("variantId");
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
  // (scoped to base or variant depending on variantId)
  const template = await prisma.plotTemplate.findUnique({
    where: { id },
    include: {
      jobs: {
        where: { parentId: null, variantId: variantId },
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

        // Create parent stage (scoped to base or variant)
        const parent = await tx.templateJob.create({
          data: {
            templateId: id,
            variantId,
            name: stageDef.name,
            stageCode: stageDef.code,
            sortOrder: nextSortOrder,
            startWeek: nextStartWeek,
            endWeek: parentEndWeek,
          },
        });

        // Create sub-jobs (same scope as parent). durationDays is the
        // canonical SSOT field; durationWeeks is the legacy fallback.
        // Stage library defaults are weeks → multiply by 5 to land
        // canonical days. Both written so old readers keep working.
        for (const sj of subJobsWithWeeks) {
          await tx.templateJob.create({
            data: {
              templateId: id,
              variantId,
              parentId: parent.id,
              name: sj.name,
              stageCode: sj.code,
              sortOrder: sj.sortOrder,
              startWeek: sj.startWeek,
              endWeek: sj.endWeek,
              durationDays: sj.duration * 5,
              durationWeeks: sj.duration,
            },
          });
        }

        // Advance for next stage
        nextSortOrder++;
        nextStartWeek = parentEndWeek + 1;
      }

      // Return updated template (or variant) so the client can swap
      // it in. Variant context returns the variant-scoped jobs only.
      if (variantId) {
        const variant = await tx.templateVariant.findUnique({
          where: { id: variantId },
        });
        const jobs = await tx.templateJob.findMany(variantJobsInclude(variantId));
        return variant
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
      }
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
