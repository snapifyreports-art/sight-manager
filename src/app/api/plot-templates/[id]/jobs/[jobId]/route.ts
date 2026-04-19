import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

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

  try {
    const updated = await prisma.templateJob.update({
      where: { id: jobId },
      data: {
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
      },
      include: {
        orders: {
          include: { items: true },
        },
        children: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update template job");
  }
}

// DELETE /api/plot-templates/[id]/jobs/[jobId] — delete a template job
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;

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
    // Delete children first, then parent (avoids FK issues in some DBs)
    if (job.children.length > 0) {
      await prisma.templateJob.deleteMany({
        where: { parentId: jobId },
      });
    }
    await prisma.templateJob.delete({ where: { id: jobId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete template job");
  }
}
