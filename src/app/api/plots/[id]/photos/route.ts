import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/plots/[id]/photos — all photos across all jobs in a plot
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // (May 2026 audit #1) Verify caller can access the plot's site.
  const plot = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true },
  });
  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }
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

  const photos = await prisma.jobPhoto.findMany({
    where: { job: { plotId: id } },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(photos);
}
