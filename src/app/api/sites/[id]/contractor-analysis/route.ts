import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { differenceInWorkingDays } from "@/lib/working-days";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/contractor-analysis
 *
 * Per-contractor performance breakdown for a site. Used by:
 *   - Site Story tab's contractor leaderboard (lighter version)
 *   - Handover ZIP's `/03_Contractor_Analysis/` section
 *
 * Returns one row per contact with jobs assigned, completed, on-time
 * vs late counts, total days late, and a per-job detail array for
 * the per-contractor PDF.
 */

interface ContractorRow {
  contactId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobsAssigned: number;
  jobsCompleted: number;
  jobsOnTime: number;
  jobsLate: number;
  totalDelayDaysAttributed: number;
  jobs: Array<{
    jobId: string;
    jobName: string;
    plotNumber: string | null;
    plotHouseType: string | null;
    status: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    daysLate: number | null;
  }>;
}

// (May 2026 audit D-P1-7) Inline `workingDaysBetween` removed — was a
// shadow of `differenceInWorkingDays` from `@/lib/working-days`. Any
// future bank-holiday handling, working-day rule change, or weekend
// definition change wouldn't have propagated to three shadowed copies
// (here, supplier-analysis, site-story). All three now route through
// the SSOT helper.
//
// `differenceInWorkingDays` returns a SIGNED delta (b before a → negative).
// The old `workingDaysBetween` returned 0 for b <= a. Callers below clamp
// with Math.max(0, ...) where needed to preserve the old non-negative
// contract at the consumer.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  try {
    const rows = await prisma.jobContractor.findMany({
      where: { job: { plot: { siteId: id } } },
      select: {
        contactId: true,
        contact: {
          select: {
            id: true,
            name: true,
            company: true,
            email: true,
            phone: true,
          },
        },
        job: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            actualStartDate: true,
            actualEndDate: true,
            originalEndDate: true,
            plot: {
              select: { plotNumber: true, houseType: true },
            },
          },
        },
      },
    });

    const map = new Map<string, ContractorRow>();
    for (const r of rows) {
      const row =
        map.get(r.contactId) ?? {
          contactId: r.contactId,
          name: r.contact.name,
          company: r.contact.company,
          email: r.contact.email,
          phone: r.contact.phone,
          jobsAssigned: 0,
          jobsCompleted: 0,
          jobsOnTime: 0,
          jobsLate: 0,
          totalDelayDaysAttributed: 0,
          jobs: [],
        };

      row.jobsAssigned++;

      let daysLate: number | null = null;
      if (r.job.status === "COMPLETED") {
        row.jobsCompleted++;
        if (
          r.job.actualEndDate &&
          r.job.actualEndDate.getTime() <= r.job.originalEndDate.getTime()
        ) {
          row.jobsOnTime++;
          daysLate = 0;
        } else if (r.job.actualEndDate) {
          row.jobsLate++;
          // Working-day delta from originalEnd → actualEnd. Clamp to 0
          // (older inline shadow returned 0 for negative deltas; preserve
          // that semantic — "jobs late" can't be negatively-late).
          daysLate = Math.max(
            0,
            differenceInWorkingDays(r.job.actualEndDate, r.job.originalEndDate),
          );
          row.totalDelayDaysAttributed += daysLate;
        }
      }

      row.jobs.push({
        jobId: r.job.id,
        jobName: r.job.name,
        plotNumber: r.job.plot.plotNumber,
        plotHouseType: r.job.plot.houseType,
        status: r.job.status,
        plannedStart: r.job.startDate?.toISOString() ?? null,
        plannedEnd: r.job.endDate?.toISOString() ?? null,
        actualStart: r.job.actualStartDate?.toISOString() ?? null,
        actualEnd: r.job.actualEndDate?.toISOString() ?? null,
        daysLate,
      });

      map.set(r.contactId, row);
    }

    const contractors = Array.from(map.values()).sort(
      (a, b) => b.jobsCompleted - a.jobsCompleted,
    );
    return NextResponse.json({ contractors });
  } catch (err) {
    return apiError(err, "Failed to build contractor analysis");
  }
}
