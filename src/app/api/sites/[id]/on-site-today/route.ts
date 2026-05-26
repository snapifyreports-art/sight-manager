import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { getServerStartOfDay } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/on-site-today
 *
 * (May 2026 Keith request) "Who's expected on site today" roll-up.
 *
 * v1 derives expectation from JobContractor + Job state: a contractor
 * is "expected today" if they're attached to a job whose
 * [startDate, endDate] window straddles today AND the job isn't yet
 * COMPLETED/CANCELLED. Grouped by contractor company so the page
 * reads "Baker Groundworks — 6 jobs across 4 plots".
 *
 * v2 (not yet wired) will fold in actual QR sign-ins and RAMS /
 * insurance expiry warnings. Adding the data surface first means the
 * page is useful immediately on real-world programme data without
 * waiting for a new schema model + onboarding flow.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (
      !(await canAccessSite(
        session.user.id,
        (session.user as { role: string }).role,
        id,
      ))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dayStart = getServerStartOfDay(req);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    // Pull all JobContractor rows whose job overlaps today, then
    // group by contact. We deliberately count jobs (not plots) since
    // a single plot can have multiple stages running concurrently —
    // a sub on two stages at the same plot is still doing two jobs.
    const rows = await prisma.jobContractor.findMany({
      where: {
        job: {
          plot: { siteId: id },
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
          children: { none: {} },
        },
      },
      select: {
        contactId: true,
        contact: {
          select: {
            id: true,
            name: true,
            company: true,
            email: true,
            phone: true,
            archivedAt: true,
          },
        },
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
                plotNumber: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Group by contact id.
    type JobRow = {
      id: string;
      name: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
      plot: { id: string; plotNumber: string | null; name: string };
    };
    const byContact = new Map<
      string,
      {
        contactId: string;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        archived: boolean;
        jobs: JobRow[];
      }
    >();
    const plotIdsByContact = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.contact) continue;
      const c = r.contact;
      const entry =
        byContact.get(c.id) ?? {
          contactId: c.id,
          name: c.name,
          company: c.company,
          email: c.email,
          phone: c.phone,
          archived: !!c.archivedAt,
          jobs: [],
        };
      entry.jobs.push({
        id: r.job.id,
        name: r.job.name,
        status: r.job.status,
        startDate: r.job.startDate?.toISOString() ?? null,
        endDate: r.job.endDate?.toISOString() ?? null,
        plot: r.job.plot,
      });
      byContact.set(c.id, entry);
      const plotSet = plotIdsByContact.get(c.id) ?? new Set<string>();
      plotSet.add(r.job.plot.id);
      plotIdsByContact.set(c.id, plotSet);
    }

    const expected = Array.from(byContact.values())
      .filter((c) => !c.archived)
      .map((c) => ({
        contactId: c.contactId,
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        jobsCount: c.jobs.length,
        plotsCount: plotIdsByContact.get(c.contactId)?.size ?? 0,
        jobs: c.jobs,
      }))
      // Companies with the most active jobs first.
      .sort((a, b) => b.jobsCount - a.jobsCount);

    return NextResponse.json({
      date: dayStart.toISOString(),
      totalContractors: expected.length,
      totalJobs: expected.reduce((s, c) => s + c.jobsCount, 0),
      expected,
    });
  } catch (err) {
    return apiError(err, "Failed to load on-site-today");
  }
}
