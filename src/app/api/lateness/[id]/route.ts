import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/lateness/[id]
 * Body: { reasonCode?, reasonNote?, attributedContactId? }
 *
 * (#191) Manager attribution. Updates the reason + attribution on an
 * open lateness event so reports reflect the actual cause.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const event = await prisma.latenessEvent.findUnique({
      where: { id },
      select: { id: true, siteId: true },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, event.siteId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.reasonCode !== undefined) data.reasonCode = body.reasonCode;
    if (body.reasonNote !== undefined) data.reasonNote = body.reasonNote;
    if (body.attributedContactId !== undefined) {
      data.attributedContactId = body.attributedContactId || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    data.recordedById = session.user.id;
    const updated = await prisma.latenessEvent.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update lateness event");
  }
}
