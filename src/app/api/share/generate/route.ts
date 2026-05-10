import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signShareToken } from "@/lib/share-token";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// POST /api/share/generate — generate a shareable read-only link for a plot
// Body: { plotId: string, expiryDays?: number (default 30) }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { plotId, expiryDays = 30 } = body;

  if (!plotId) {
    return NextResponse.json({ error: "plotId is required" }, { status: 400 });
  }

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // (May 2026 audit #1) Verify caller can access the plot's site
  // before minting a public share link to it. Pre-fix any logged-in
  // user could create public URLs for plots on sites they had no
  // business with, and signed tokens have no DB-backed revocation.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      plot.siteId,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  const days = Math.min(Math.max(1, Number(expiryDays) || 30), 365);
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const token = signShareToken({ plotId, exp });

  const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
  const url = `${baseUrl}/share/${token}`;

  return NextResponse.json({
    token,
    url,
    expiresAt: new Date(exp).toISOString(),
    plot: { id: plot.id, name: plot.name, plotNumber: plot.plotNumber, siteName: plot.site.name },
  });
}
