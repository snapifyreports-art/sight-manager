import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * (May 2026 Keith request) Mutate a single toolbox talk.
 *
 * PATCH — actions:
 *   - { action: "complete", attendees?, notes? }
 *       Flip REQUESTED → COMPLETED, stamp deliveredAt + deliveredBy.
 *       Optional attendees + notes updates captured at the same time
 *       (manager often only knows them when actually closing out).
 *   - { action: "cancel" }
 *       Flip REQUESTED → CANCELLED. Leaves the audit row intact.
 *   - { action: "edit", topic?, notes?, attendees?, contractorIds?, dueBy? }
 *       Edit fields without changing status.
 */

async function authorise(siteId: string) {
  const session = await auth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      siteId,
    ))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission (EDIT_PROGRAMME)" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; talkId: string }> },
) {
  const { id, talkId } = await params;
  const a = await authorise(id);
  if ("error" in a) return a.error;

  const existing = await prisma.toolboxTalk.findUnique({
    where: { id: talkId },
    select: { id: true, siteId: true, topic: true, status: true },
  });
  if (!existing || existing.siteId !== id) {
    return NextResponse.json({ error: "Talk not found" }, { status: 404 });
  }

  const body = await req.json();
  const action: string = body?.action ?? "edit";

  try {
    if (action === "complete") {
      if (existing.status === "COMPLETED") {
        return NextResponse.json({ error: "Already complete" }, { status: 400 });
      }
      const updated = await prisma.toolboxTalk.update({
        where: { id: talkId },
        data: {
          status: "COMPLETED",
          deliveredAt: new Date(),
          deliveredBy: a.session.user.id,
          // Manager often fills these in at sign-off time.
          ...(typeof body?.attendees === "string"
            ? { attendees: body.attendees || null }
            : {}),
          ...(typeof body?.notes === "string"
            ? { notes: body.notes || null }
            : {}),
        },
        include: { attachments: true },
      });
      await logEvent(prisma, {
        type: "USER_ACTION",
        siteId: id,
        userId: a.session.user.id,
        description: `Toolbox talk completed: "${existing.topic}"`,
      });
      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (existing.status === "CANCELLED") {
        return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
      }
      const updated = await prisma.toolboxTalk.update({
        where: { id: talkId },
        data: { status: "CANCELLED" },
        include: { attachments: true },
      });
      await logEvent(prisma, {
        type: "USER_ACTION",
        siteId: id,
        userId: a.session.user.id,
        description: `Toolbox talk cancelled: "${existing.topic}"`,
      });
      return NextResponse.json(updated);
    }

    if (action === "edit") {
      const data: Record<string, unknown> = {};
      if (typeof body?.topic === "string" && body.topic.trim()) {
        data.topic = body.topic.trim();
      }
      if (typeof body?.notes === "string") data.notes = body.notes || null;
      if (typeof body?.attendees === "string") {
        data.attendees = body.attendees || null;
      }
      if (Array.isArray(body?.contractorIds)) {
        data.contractorIds = body.contractorIds.filter(
          (x: unknown): x is string => typeof x === "string",
        );
      }
      if (body?.dueBy !== undefined) {
        data.dueBy = body.dueBy ? new Date(body.dueBy) : null;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }
      const updated = await prisma.toolboxTalk.update({
        where: { id: talkId },
        data,
        include: { attachments: true },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return apiError(err, "Failed to update toolbox talk");
  }
}
