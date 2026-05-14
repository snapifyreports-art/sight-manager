import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

// (May 2026 pattern sweep) Templates = programme building blocks.
// Mutation verbs all require EDIT_PROGRAMME; a CONTRACTOR with valid
// auth used to be able to PUT/DELETE here freely.
function requireEditProgramme(session: { user: unknown }) {
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
  return null;
}

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id] — single template with all nested data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const template = await prisma.plotTemplate.findUnique({
    where: { id },
    include: {
      jobs: templateJobsInclude,
      _count: { select: { sourcedPlots: true } },
    },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(normaliseTemplateParentDates(template));
}

// PUT /api/plot-templates/[id] — update template metadata
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireEditProgramme(session);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { name, description, typeLabel, isDraft, archivedAt } = body;

  const existing = await prisma.plotTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  try {
    const template = await prisma.plotTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(typeLabel !== undefined && {
          typeLabel: typeLabel?.trim() || null,
        }),
        ...(typeof isDraft === "boolean" && { isDraft }),
        // (May 2026 audit S-P0) Accept archivedAt for soft-delete /
        // restore via PUT. `null` restores; ISO string archives.
        ...(archivedAt === null ? { archivedAt: null } : {}),
        ...(typeof archivedAt === "string"
          ? { archivedAt: new Date(archivedAt) }
          : {}),
      },
      include: {
        jobs: templateJobsInclude,
      },
    });

    // Audit log
    const events: Array<{ action: string; detail: string }> = [];
    if (name !== undefined && name.trim() !== existing.name) {
      events.push({
        action: "renamed",
        detail: `Renamed from "${existing.name}" to "${name.trim()}"`,
      });
    }
    if (typeof isDraft === "boolean" && isDraft !== existing.isDraft) {
      events.push({
        action: isDraft ? "marked_draft" : "marked_live",
        detail: isDraft
          ? "Marked as draft (hidden from apply-picker)"
          : "Marked as live (available to apply to plots)",
      });
    }
    for (const ev of events) {
      await prisma.templateAuditEvent.create({
        data: {
          templateId: id,
          userId: session.user?.id ?? null,
          userName: session.user?.name ?? session.user?.email ?? null,
          action: ev.action,
          detail: ev.detail,
        },
      });
    }

    return NextResponse.json(normaliseTemplateParentDates(template));
  } catch (err) {
    return apiError(err, "Failed to update template");
  }
}

// DELETE /api/plot-templates/[id] — delete template (cascades)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireEditProgramme(session);
  if (denied) return denied;

  const { id } = await params;

  const existing = await prisma.plotTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  try {
    // (May 2026 audit S-P0) Soft-archive. Templates with historical
    // Plot references (Plot.sourceTemplateId) can't be hard-deleted
    // anyway — the FK would block. Archive stamps `archivedAt` so the
    // template drops out of the apply-to-plot picker but every
    // previously-applied plot keeps its template provenance.
    await prisma.plotTemplate.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (err) {
    return apiError(err, "Failed to archive template");
  }
}
