import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { differenceInDays } from "date-fns";
import { canAccessSite } from "@/lib/site-access";

// (May 2026 audit B-P1-5) Snag age is CALENDAR-day intentionally — a
// snag sitting open over a weekend is still 2 days older. The rest of
// the app uses working-days for "days late" (jobs / orders), but
// "days open" on a snag is a pure age count. Weekly Digest's stale-
// snag > 30 days threshold uses calendar too — consistent within
// the snag reporting surface.

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/snag-report — snag ageing analytics
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
  const now = getServerCurrentDate(req);

  const snags = await prisma.snag.findMany({
    where: { plot: { siteId: id } },
    select: {
      id: true,
      description: true,
      location: true,
      priority: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      assignedTo: { select: { name: true } },
      plot: { select: { plotNumber: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Split into open and resolved
  const openSnags = snags.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS");
  const resolvedSnags = snags.filter((s) => s.status === "RESOLVED" || s.status === "CLOSED");

  // Age buckets for open snags
  const ageBuckets = { under7: 0, days7to14: 0, days14to30: 0, over30: 0 };
  for (const s of openSnags) {
    const age = differenceInDays(now, new Date(s.createdAt));
    if (age < 7) ageBuckets.under7++;
    else if (age < 14) ageBuckets.days7to14++;
    else if (age < 30) ageBuckets.days14to30++;
    else ageBuckets.over30++;
  }

  // Average resolution time (in days)
  const resolutionTimes = resolvedSnags
    .filter((s) => s.resolvedAt)
    .map((s) => differenceInDays(new Date(s.resolvedAt!), new Date(s.createdAt)));
  const avgResolutionDays =
    resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : 0;

  // Priority breakdown (all snags)
  const priorityCounts = {
    LOW: snags.filter((s) => s.priority === "LOW").length,
    MEDIUM: snags.filter((s) => s.priority === "MEDIUM").length,
    HIGH: snags.filter((s) => s.priority === "HIGH").length,
    CRITICAL: snags.filter((s) => s.priority === "CRITICAL").length,
  };

  // Top 10 oldest open snags
  const oldestOpen = openSnags
    .map((s) => ({
      id: s.id,
      description: s.description,
      location: s.location,
      priority: s.priority,
      status: s.status,
      daysOpen: differenceInDays(now, new Date(s.createdAt)),
      assignedTo: s.assignedTo?.name || null,
      plot: s.plot.plotNumber ? `Plot ${s.plot.plotNumber}` : s.plot.name,
      createdAt: s.createdAt.toISOString(),
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .slice(0, 10);

  return NextResponse.json({
    totalSnags: snags.length,
    openCount: openSnags.length,
    resolvedCount: resolvedSnags.length,
    avgResolutionDays,
    ageBuckets,
    priorityCounts,
    oldestOpen,
  });
}
