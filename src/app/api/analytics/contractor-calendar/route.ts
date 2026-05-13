import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";
import { differenceInWorkingDays } from "@/lib/working-days";
import { getServerStartOfDay } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #52) Contractor calendar.
 *
 * For each accessible contractor, returns their scheduled job
 * windows (startDate / endDate / plot label / site) so a calendar UI
 * can show contractor-by-contractor lanes. ?weeks=N (default 8)
 * controls the look-ahead window.
 *
 * Helps a manager spot:
 *   - Contractors double-booked across plots
 *   - Gaps in a contractor's schedule
 *   - Contractors with too many parallel jobs to physically deliver
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const url = new URL(req.url);
  const weeks = Math.min(
    Math.max(Number(url.searchParams.get("weeks") ?? "8") || 8, 1),
    26,
  );
  const horizon = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
  // (May 2026 audit D-P1) Use the dev-date-aware start-of-day so
  // simulations + replays see the same "today" as every other lateness
  // surface. Pre-fix `new Date()` was wall-clock real-time only.
  const now = getServerStartOfDay(req);

  const links = await prisma.jobContractor.findMany({
    where: {
      job: {
        startDate: { lte: horizon },
        endDate: { gte: now },
        children: { none: {} },
        ...(siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {}),
      },
    },
    select: {
      contact: { select: { id: true, name: true, company: true } },
      job: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          plot: {
            select: {
              id: true,
              name: true,
              plotNumber: true,
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  // Group by contractor.
  const map = new Map<
    string,
    {
      contactId: string;
      name: string;
      company: string | null;
      jobs: Array<{
        jobId: string;
        jobName: string;
        status: string;
        start: string;
        end: string;
        plotLabel: string;
        siteName: string;
        // (May 2026 audit D-P1) Lateness overlay — `daysLate > 0`
        // means this job has already crossed its planned endDate.
        // Widget renders late slots in red so a manager scanning the
        // calendar can spot who's running over.
        daysLate: number;
      }>;
    }
  >();
  for (const l of links) {
    if (!l.job.startDate || !l.job.endDate) continue;
    const cur = map.get(l.contact.id) ?? {
      contactId: l.contact.id,
      name: l.contact.name,
      company: l.contact.company,
      jobs: [],
    };
    // Compute daysLate same way the Lateness SSOT does — working-day
    // arithmetic anchored to today, only for jobs still not COMPLETED.
    let daysLate = 0;
    if (l.job.status !== "COMPLETED" && l.job.endDate < now) {
      daysLate = Math.max(0, differenceInWorkingDays(now, l.job.endDate));
    }
    cur.jobs.push({
      jobId: l.job.id,
      jobName: l.job.name,
      status: l.job.status,
      start: l.job.startDate.toISOString(),
      end: l.job.endDate.toISOString(),
      plotLabel: l.job.plot.plotNumber
        ? `Plot ${l.job.plot.plotNumber}`
        : l.job.plot.name,
      siteName: l.job.plot.site.name,
      daysLate,
    });
    map.set(l.contact.id, cur);
  }

  const contractors = Array.from(map.values())
    .map((c) => ({
      ...c,
      jobs: c.jobs.sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => (a.company ?? a.name).localeCompare(b.company ?? b.name));

  return NextResponse.json({ weeks, horizon: horizon.toISOString(), contractors });
}
