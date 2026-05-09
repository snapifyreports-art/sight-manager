import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Customer share-link management. Endpoint sits inside the plot CRUD
 * tree because the link is per-plot and only a site member can manage
 * it.
 *
 * GET    — current link state ({ token, enabled, url })
 * POST   — generate (if missing) or rotate (if rotate=true) the token
 * PATCH  — toggle enabled flag without changing the token
 *
 * Token is stored on Plot.shareToken (unique). It's a 24-byte
 * base64url string — short enough to fit a QR comfortably, long enough
 * that brute-forcing the keyspace is hopeless. We do NOT sign these:
 * unlike the legacy /api/share signed-token feature, this link is
 * read-only and the server checks Plot.shareEnabled on every public
 * fetch, so a leaked token can be revoked instantly by clicking
 * "Disable" or "Rotate".
 */

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

async function authoriseAdmin(plotId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { id: true, siteId: true, shareToken: true, shareEnabled: true, plotNumber: true, name: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))) {
    return { error: NextResponse.json({ error: "You do not have access to this site" }, { status: 403 }) };
  }
  return { plot, userId: session.user.id, siteId: plot.siteId };
}

function buildShareUrl(req: NextRequest, token: string): string {
  const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
  return `${baseUrl}/progress/${token}`;
}

// GET — current link state
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  return NextResponse.json({
    token: result.plot.shareToken,
    enabled: result.plot.shareEnabled,
    url: result.plot.shareToken ? buildShareUrl(req, result.plot.shareToken) : null,
  });
}

// POST — generate or rotate. body: { rotate?: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => ({}));
  const rotate = body?.rotate === true;

  // Generate iff missing OR caller asked to rotate
  let token = result.plot.shareToken;
  if (!token || rotate) {
    token = newToken();
  }

  try {
    const updated = await prisma.plot.update({
      where: { id },
      data: { shareToken: token, shareEnabled: true },
      select: { shareToken: true, shareEnabled: true },
    });

    return NextResponse.json({
      token: updated.shareToken,
      enabled: updated.shareEnabled,
      url: buildShareUrl(req, updated.shareToken!),
    });
  } catch (err) {
    return apiError(err, "Failed to update share link");
  }
}

// PATCH — toggle enabled. body: { enabled: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  try {
    const updated = await prisma.plot.update({
      where: { id },
      data: { shareEnabled: body.enabled },
      select: { shareToken: true, shareEnabled: true },
    });

    return NextResponse.json({
      token: updated.shareToken,
      enabled: updated.shareEnabled,
      url: updated.shareToken ? buildShareUrl(req, updated.shareToken) : null,
    });
  } catch (err) {
    return apiError(err, "Failed to update share link");
  }
}
