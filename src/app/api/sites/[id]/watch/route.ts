import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #152) Per-user "watch this site" toggle.
 *
 * POST   → start watching (idempotent — re-posting is fine)
 * DELETE → stop watching
 *
 * Watching is a notification-opt-in concern, distinct from UserSite
 * (which is access control). A user with site access (CEO/Director
 * have access to everything) can choose which sites they want
 * notifications for; assignees can mute a busy site they're already
 * looped into elsewhere.
 *
 * Caller must have site access — you can't watch a site you can't
 * see, so the same RBAC gate the rest of the API uses applies here.
 */

async function authoriseSite(
  session: { user: { id: string; role?: string } },
  siteId: string,
) {
  if (!(await canAccessSite(session.user.id, session.user.role ?? "", siteId))) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }
  return null;
}

// POST — start watching
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await authoriseSite(session, id);
  if (denied) return denied;

  try {
    const watch = await prisma.watchedSite.upsert({
      where: { userId_siteId: { userId: session.user.id, siteId: id } },
      update: {},
      create: { userId: session.user.id, siteId: id },
      select: { id: true, createdAt: true },
    });
    return NextResponse.json({ watching: true, since: watch.createdAt });
  } catch (err) {
    return apiError(err, "Failed to start watching site");
  }
}

// DELETE — stop watching
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await authoriseSite(session, id);
  if (denied) return denied;

  try {
    await prisma.watchedSite.deleteMany({
      where: { userId: session.user.id, siteId: id },
    });
    return NextResponse.json({ watching: false });
  } catch (err) {
    return apiError(err, "Failed to stop watching site");
  }
}

// GET — am I watching?
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await authoriseSite(session, id);
  if (denied) return denied;

  const watch = await prisma.watchedSite.findUnique({
    where: { userId_siteId: { userId: session.user.id, siteId: id } },
    select: { createdAt: true },
  });
  return NextResponse.json({ watching: !!watch, since: watch?.createdAt ?? null });
}
