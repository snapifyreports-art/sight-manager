import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/plot-templates/[id]/recalculate-stages
 *
 * Recomputes `startWeek` / `endWeek` for EVERY top-level stage in the
 * template, sequentially, based on each stage's own duration.
 *
 * - Parent-with-children stages: span = max(child.endWeek) - currentWeek + 1,
 *   i.e. they already get recalculated when a child changes via the
 *   `/jobs/[jobId]/recalculate` endpoint, but we include them here for a
 *   unified pass.
 * - Atomic stages (no children): span derived from `durationDays` (rounded
 *   up to the nearest whole week so the grid slot is clean) or
 *   `durationWeeks` if that's what's stored.
 *
 * Why this endpoint exists: when you edit a top-level atomic stage's
 * durationDays via PUT /jobs/[jobId], the PUT only updates that row.
 * startWeek/endWeek on all DOWNSTREAM siblings then lie. The
 * TemplateEditor's Timeline Preview reads those stored weeks, so the
 * editor shows a wrong layout until you POST here.
 *
 * Smoke test Apr 2026 caught this: Strip-out 1wk + Refurbishment 1wk
 * → user sets Refurbishment = 15 days → PUT stores durationDays=15 but
 * endWeek stays at 2 → preview still shows Wk 2-2 not Wk 2-4.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const template = await prisma.plotTemplate.findUnique({
    where: { id },
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Helper: given a stage (parent or atomic), determine how many grid WEEKS
  // it should occupy. Parents with children use their children's total span;
  // atomic stages use durationDays (rounded up to whole weeks) or
  // durationWeeks.
  function weeksForStage(stage: NonNullable<typeof template>["jobs"][number]): number {
    const childCount = stage.children.length;
    if (childCount > 0) {
      // Sum children grid weeks. days-unit children: round their durationDays
      // up to whole weeks. Previously these were collapsed to 1-week slots
      // ("the actual cascade honours durationDays at plot creation time"),
      // but Keith pointed out (May 2026) that the preview then lies — a 20-
      // working-day Foundations shows as 1 grid week in the editor and
      // 4 weeks on the actual plot. Make the preview honest.
      return stage.children.reduce((acc, c) => {
        const w =
          c.durationDays && c.durationDays > 0
            ? Math.max(1, Math.ceil(c.durationDays / 5))
            : c.durationWeeks && c.durationWeeks > 0
              ? c.durationWeeks
              : 1;
        return acc + w;
      }, 0);
    }
    if (stage.durationDays && stage.durationDays > 0) {
      return Math.max(1, Math.ceil(stage.durationDays / 5));
    }
    if (stage.durationWeeks && stage.durationWeeks > 0) {
      return stage.durationWeeks;
    }
    // Fall back to whatever the stage already says — keeps legacy templates
    // stable if they somehow have neither field set.
    return Math.max(1, stage.endWeek - stage.startWeek + 1);
  }

  try {
    await prisma.$transaction(async (tx) => {
      let currentWeek = 1;
      for (const stage of template.jobs) {
        const weeks = weeksForStage(stage);
        const startWeek = currentWeek;
        const endWeek = startWeek + weeks - 1;
        currentWeek = endWeek + 1;

        await tx.templateJob.update({
          where: { id: stage.id },
          data: { startWeek, endWeek },
        });

        // If the stage has children, also recompute child windows so they
        // slot into the stage's new position. Same days→grid-weeks rule as
        // weeksForStage: durationDays rounded up to whole weeks beats
        // durationWeeks beats 1.
        if (stage.children.length > 0) {
          let childWeek = startWeek;
          for (const child of stage.children) {
            const childSpan =
              child.durationDays && child.durationDays > 0
                ? Math.max(1, Math.ceil(child.durationDays / 5))
                : child.durationWeeks && child.durationWeeks > 0
                  ? child.durationWeeks
                  : 1;
            const childStart = childWeek;
            const childEnd = childStart + childSpan - 1;
            childWeek = childEnd + 1;
            await tx.templateJob.update({
              where: { id: child.id },
              data: { startWeek: childStart, endWeek: childEnd },
            });
          }
        }
      }
    });

    // Return the refreshed template so the client can swap it in.
    const refreshed = await prisma.plotTemplate.findUnique({
      where: { id },
      include: { jobs: templateJobsInclude },
    });

    return NextResponse.json(
      refreshed ? normaliseTemplateParentDates(refreshed) : refreshed,
    );
  } catch (err) {
    return apiError(err, "Failed to recalculate template stages");
  }
}
