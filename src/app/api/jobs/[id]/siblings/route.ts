import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: { plotId: true, sortOrder: true, plot: { select: { siteId: true } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const siblings = await prisma.job.findMany({
    where: { plotId: job.plotId },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      startDate: true,
      endDate: true,
      status: true,
      parentStage: true,
    },
  });

  return NextResponse.json({ currentJobId: id, siblings });
}
