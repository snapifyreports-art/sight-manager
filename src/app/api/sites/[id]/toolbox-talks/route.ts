import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #176) Toolbox talk CRUD for a site.
 * GET — list newest-first.
 * POST — create. body: { topic, notes?, attendees?, deliveredAt? }
 */

async function authorise(siteId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authorise(id);
  if ("error" in a) return a.error;

  const talks = await prisma.toolboxTalk.findMany({
    where: { siteId: id },
    orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return NextResponse.json(talks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authorise(id);
  if ("error" in a) return a.error;

  const body = await req.json();
  if (!body?.topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  try {
    const talk = await prisma.toolboxTalk.create({
      data: {
        siteId: id,
        topic: body.topic.trim(),
        notes: body.notes || null,
        attendees: body.attendees || null,
        deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : new Date(),
        deliveredBy: a.session.user.id,
      },
    });
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        siteId: id,
        userId: a.session.user.id,
        description: `Toolbox talk logged: "${talk.topic}"`,
      },
    });
    return NextResponse.json(talk, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to log toolbox talk");
  }
}
