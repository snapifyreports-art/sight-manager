import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { resequenceTopLevelStages } from "@/lib/template-pack-children";

export const dynamic = "force-dynamic";

// PUT /api/plot-templates/[id]/jobs/[jobId] — update a template job
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId") || null;
  const body = await request.json();
  const { name, description, stageCode, sortOrder, startWeek, endWeek, durationWeeks, durationDays, parentId, weatherAffected, weatherAffectedType, contactId } = body;

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  // (#7) Detect whether this PUT changes a layout-affecting field. If it
  // does, we must rerun resequenceTopLevelStages so siblings + parent
  // caches stay in sync — otherwise the cache silently drifts and the
  // next apply-template inherits the wrong layout. Non-layout edits
  // (name, contractor, weatherAffected, etc.) skip the recompute to
  // keep edit perf snappy.
  const changesLayout =
    durationDays !== undefined ||
    durationWeeks !== undefined ||
    sortOrder !== undefined ||
    parentId !== undefined;

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const updateData = {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && {
            description: description?.trim() || null,
          }),
          ...(stageCode !== undefined && {
            stageCode: stageCode?.trim() || null,
          }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(startWeek !== undefined && { startWeek }),
          ...(endWeek !== undefined && { endWeek }),
          ...(durationWeeks !== undefined && { durationWeeks }),
          ...(durationDays !== undefined && { durationDays }),
          ...(weatherAffected !== undefined && { weatherAffected }),
          ...(weatherAffectedType !== undefined && { weatherAffectedType: weatherAffectedType || null }),
          ...(contactId !== undefined && { contactId: contactId || null }),
          ...(parentId !== undefined && { parentId: parentId || null }),
        };
        await tx.templateJob.update({ where: { id: jobId }, data: updateData });

        if (changesLayout) {
          await resequenceTopLevelStages(tx, id, variantId);
        }

        return tx.templateJob.findUnique({
          where: { id: jobId },
          include: {
            orders: { include: { items: true } },
            children: { orderBy: { sortOrder: "asc" } },
          },
        });
      },
      // Same envelope as recalculate-stages — full template walk can
      // be expensive on big templates with many sub-jobs.
      { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update template job");
  }
}

// DELETE /api/plot-templates/[id]/jobs/[jobId] — delete a template job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId") || null;

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
    include: { children: { select: { id: true } } },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        // Delete children first, then parent (avoids FK issues in some DBs)
        if (job.children.length > 0) {
          await tx.templateJob.deleteMany({ where: { parentId: jobId } });
        }
        await tx.templateJob.delete({ where: { id: jobId } });
        // (#7 cousin) Stage delete is a layout change — re-sequence so
        // sibling startWeek/endWeek caches catch up.
        await resequenceTopLevelStages(tx, id, variantId);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete template job");
  }
}
