import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * Site-level overview: every plot's customer-share link state plus
 * counts of journal entries and shared photos so admin can see at a
 * glance which plots have rich content vs which are bare. Powers the
 * "Customer Pages" tab under Site Admin in the sidebar.
 */
export async function GET(
  _req: NextRequest,
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

  const plots = await prisma.plot.findMany({
    where: { siteId: id },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      plotNumber: true,
      houseType: true,
      shareToken: true,
      shareEnabled: true,
      _count: {
        select: {
          journalEntries: true,
        },
      },
      // Shared photo count needs a relation hop (Plot → Job → JobPhoto)
      // so it goes in a separate query below.
    },
  });

  // Shared photo counts in one round trip
  const photoCounts = await prisma.jobPhoto.groupBy({
    by: ["jobId"],
    where: {
      sharedWithCustomer: true,
      job: { plotId: { in: plots.map((p) => p.id) } },
    },
    _count: true,
  });

  // Map jobId → count, then sum per plotId via a Job lookup
  const jobs = await prisma.job.findMany({
    where: { plotId: { in: plots.map((p) => p.id) } },
    select: { id: true, plotId: true },
  });
  const plotPhotoCount = new Map<string, number>();
  for (const j of jobs) {
    const row = photoCounts.find((r) => r.jobId === j.id);
    if (row) {
      plotPhotoCount.set(j.plotId, (plotPhotoCount.get(j.plotId) ?? 0) + row._count);
    }
  }

  // Sort numerically by plotNumber (Prisma sorts lexicographically)
  plots.sort((a, b) => {
    const numA = parseInt(a.plotNumber ?? "", 10);
    const numB = parseInt(b.plotNumber ?? "", 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return (a.plotNumber ?? "").localeCompare(b.plotNumber ?? "");
  });

  return NextResponse.json(
    plots.map((p) => ({
      id: p.id,
      plotNumber: p.plotNumber,
      houseType: p.houseType,
      shareToken: p.shareToken,
      shareEnabled: p.shareEnabled,
      journalCount: p._count.journalEntries,
      sharedPhotoCount: plotPhotoCount.get(p.id) ?? 0,
    })),
  );
}
