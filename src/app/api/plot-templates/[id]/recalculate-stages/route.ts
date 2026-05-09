import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, variantJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import { resequenceTopLevelStages } from "@/lib/template-pack-children";

export const dynamic = "force-dynamic";

/**
 * POST /api/plot-templates/[id]/recalculate-stages
 *
 * Recomputes `startWeek` / `endWeek` for EVERY top-level stage in the
 * template, sequentially, so they sit end-to-end with no gaps. Each
 * stage's children are also re-packed inside the new window (per-child
 * `startWeek` / `endWeek` cache stays consistent with the canonical
 * `durationDays + sortOrder`).
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
 *
 * Unified May 2026: shares logic with /jobs/[jobId]/recalculate via
 * `resequenceTopLevelStages` so the two endpoints can never diverge.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const variantId = searchParams.get("variantId");

  const exists = await prisma.plotTemplate.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  try {
    // Transaction timeout: see comment in /jobs/[jobId]/recalculate —
    // big templates exceed the 5s default and the rollback leaves
    // stale cached startWeek/endWeek.
    await prisma.$transaction(
      async (tx) => {
        await resequenceTopLevelStages(tx, id, variantId);
      },
      { timeout: 30_000 },
    );

    // Return the refreshed template (or variant) so the client can swap it in.
    if (variantId) {
      const variant = await prisma.templateVariant.findUnique({
        where: { id: variantId },
      });
      const jobs = await prisma.templateJob.findMany(
        variantJobsInclude(variantId),
      );
      const shaped = variant
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
      return NextResponse.json(
        shaped ? normaliseTemplateParentDates(shaped) : shaped,
      );
    }
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
