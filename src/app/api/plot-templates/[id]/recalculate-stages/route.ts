import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import {
  packChildrenAndUpdateParent,
  childDurationDays,
} from "@/lib/template-pack-children";

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
      // Sum children DAYS (not weeks each), then round up to whole weeks.
      // Days-unit children share weeks freely so e.g. six 3-day sub-jobs
      // = 18 working days = 4 weeks (not 6).
      const totalDays = stage.children.reduce(
        (acc, c) => acc + childDurationDays(c),
        0,
      );
      return Math.max(1, Math.ceil(totalDays / 5));
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

  // SSOT model (corrected May 2026): durationDays + sortOrder is canonical
  // for layout. We update each top-level stage's startWeek/endWeek AND
  // re-pack each stage's children's startWeek/endWeek as a derived cache
  // (so order-dialog dropdowns, collapsed-stage dot positioning, etc. see
  // current values). Cache is computed from canonical fields here, not
  // independently maintained — it can never drift.
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

        // Re-pack the stage's children (if any) inside its new window.
        // packChildrenAndUpdateParent updates child.startWeek/endWeek and
        // ALSO writes parent.endWeek again — slight overwrite of what we
        // just wrote, harmless because both should agree (same math).
        if (stage.children.length > 0) {
          await packChildrenAndUpdateParent(
            tx,
            { id: stage.id, startWeek },
            stage.children,
          );
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
