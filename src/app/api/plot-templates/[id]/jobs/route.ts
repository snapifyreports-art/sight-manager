import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/jobs — flat job list for the scope
// (?variantId=X; null = base). Used by the inspection anchor picker.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const variantId = new URL(request.url).searchParams.get("variantId");
  const jobs = await prisma.templateJob.findMany({
    where: { templateId: id, variantId },
    orderBy: { sortOrder: "asc" },
    // (Jun 2026 Q19) startWeek/endWeek included so the inspection dialog
    // can warn when an offset lands outside the anchor's stage window.
    select: { id: true, name: true, stageCode: true, parentId: true, sortOrder: true, startWeek: true, endWeek: true },
  });
  return NextResponse.json(jobs);
}

// POST /api/plot-templates/[id]/jobs — add a job to a template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to manage templates" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  // Optional variantId — when set, scope the new job to a variant.
  const variantId = searchParams.get("variantId");
  const body = await request.json();
  const { name, description, stageCode, sortOrder, startWeek, endWeek, parentId, durationWeeks, durationDays, contactId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Job name is required" },
      { status: 400 }
    );
  }

  if (startWeek == null || endWeek == null) {
    return NextResponse.json(
      { error: "startWeek and endWeek are required" },
      { status: 400 }
    );
  }

  const template = await prisma.plotTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  try {
    const job = await prisma.templateJob.create({
      data: {
        templateId: id,
        variantId,
        name: name.trim(),
        description: description?.trim() || null,
        stageCode: stageCode?.trim() || null,
        sortOrder: sortOrder ?? 0,
        startWeek,
        endWeek,
        parentId: parentId || null,
        durationWeeks: durationWeeks ?? null,
        durationDays: durationDays ?? null,
        contactId: contactId || null,
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

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add template job");
  }
}
