import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/snags — all snags across all plots for a site
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const snags = await prisma.snag.findMany({
    where: {
      plot: { siteId: id },
      ...(status && { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }),
    },
    include: {
      plot: { select: { id: true, plotNumber: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, company: true } },
      raisedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true, parentStage: true, parent: { select: { name: true } } } },
      // (Jun 2026 S6) Reverse-link — snags raised at an inspection
      // sign-off show a "from inspection" chip back to the source.
      inspection: { select: { id: true, name: true } },
      // (Jun 2026 audit) First 3 photos for SnagList's thumbnail strip —
      // this is SnagList's only feeder and without them the thumbnails
      // never rendered anywhere (only the 📷 count showed). Mirrors the
      // plot-level snags route's shape.
      photos: { select: { id: true, url: true }, take: 3 },
      _count: { select: { photos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(snags);
}
