import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #57) GET / POST compliance items for a site.
 *
 * GET returns the full list sorted by expiry asc (items expiring
 * soonest float to the top, expired items already at the top because
 * past dates sort before future ones).
 *
 * POST creates a new item. Body: { name, category?, expiresAt?,
 * documentId?, notes? }
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
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  const items = await prisma.siteComplianceItem.findMany({
    where: { siteId: id },
    orderBy: [{ expiresAt: "asc" }, { name: "asc" }],
    include: {
      document: { select: { id: true, name: true, url: true } },
    },
  });

  // (May 2026 audit #57) Mark items as EXPIRED on read if their
  // expiresAt has passed. We don't write the status back here —
  // a future cron does the persistence so the audit log is honest
  // (we want to record "expired on date X" not silently flip).
  const now = new Date();
  const decorated = items.map((it) => {
    if (
      it.status === "ACTIVE" &&
      it.expiresAt &&
      it.expiresAt.getTime() < now.getTime()
    ) {
      return { ...it, status: "EXPIRED" as const, _derivedExpired: true };
    }
    return { ...it, _derivedExpired: false };
  });

  return NextResponse.json(decorated);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const item = await prisma.siteComplianceItem.create({
      data: {
        siteId: id,
        name: body.name.trim(),
        category: body.category || null,
        status: body.expiresAt && new Date(body.expiresAt) > new Date() ? "ACTIVE" : "PENDING",
        documentId: body.documentId || null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        notes: body.notes || null,
      },
    });
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        siteId: id,
        userId: auth.session.user.id,
        description: `Compliance item "${item.name}" added`,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create compliance item");
  }
}
