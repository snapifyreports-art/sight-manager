import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/plot-templates — list all templates
//
// Query params:
//   - liveOnly=true  →  hide drafts (used by the apply-to-plot picker so
//                       half-built templates can't be applied by mistake)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const liveOnly = searchParams.get("liveOnly") === "true";
  const includeArchived = searchParams.get("include") === "archived";

  // (May 2026 audit S-P0) `liveOnly` already excludes drafts. Add the
  // archived filter: by default both archived templates AND archived-
  // tagged ones drop out. `?include=archived` exposes them for restore.
  const whereClause: Record<string, unknown> = {};
  if (liveOnly) whereClause.isDraft = false;
  if (!includeArchived) whereClause.archivedAt = null;

  const templates = await prisma.plotTemplate.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      jobs: templateJobsInclude,
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(templates.map(normaliseTemplateParentDates));
}

// POST /api/plot-templates — create a template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, typeLabel } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Template name is required" },
      { status: 400 }
    );
  }

  try {
    const template = await prisma.plotTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        typeLabel: typeLabel?.trim() || null,
        // New templates start as drafts so a half-built one can't be
        // applied to a live site by accident. User flips Live in the
        // editor when ready.
        isDraft: true,
      },
      include: {
        jobs: templateJobsInclude,
      },
    });

    // Audit log: capture creation event so the change log has a starting
    // point. userName captured at write time so subsequent renames don't
    // break history.
    await prisma.templateAuditEvent.create({
      data: {
        templateId: template.id,
        userId: session.user?.id ?? null,
        userName: session.user?.name ?? session.user?.email ?? null,
        action: "created",
        detail: `Created "${template.name}" (draft)`,
      },
    });

    return NextResponse.json(normaliseTemplateParentDates(template), { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create template");
  }
}
