import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

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
      // (Jun 2026 Wave-4 D3) LEAF jobs only — align to the contractor share
      // page, on-site-today and Contractor Comms, which all filter to leaves.
      // Counting parent rollup jobs double-counted a contractor's work.
      where: { job: { plot: { siteId: id }, children: { none: {} } } },
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
            plot: {
              select: { plotNumber: true, houseType: true },
            },
          },
        },
      },
    });

    // (Jun 2026 Wave-4 D4) Only a delay the manager ATTRIBUTED to a
    // contractor (and didn't excuse) counts against them. A job that ran late
    // due to weather, a late predecessor, a design change or a material delay
    // — attributed elsewhere or excused — is on-time as far as this
    // contractor is concerned. Build jobId → (contactId → attributed WD late).
    const latenessEvents = await prisma.latenessEvent.findMany({
      where: {
        siteId: id,
        jobId: { not: null },
        excused: false,
        attributedContactId: { not: null },
      },
      select: { jobId: true, attributedContactId: true, daysLate: true },
    });
    const attributedDelay = new Map<string, Map<string, number>>();
    for (const e of latenessEvents) {
      if (!e.jobId || !e.attributedContactId) continue;
      const byContact = attributedDelay.get(e.jobId) ?? new Map<string, number>();
      byContact.set(
        e.attributedContactId,
        (byContact.get(e.attributedContactId) ?? 0) + e.daysLate,
      );
      attributedDelay.set(e.jobId, byContact);
    }

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
        // (Jun 2026 Wave-4 D4) The contractor's delay = working days the
        // manager attributed to THEM on this job (not excused). Zero means
        // on-time for this contractor — even if the job itself finished late
        // for reasons outside their control. Pre-fix this counted ANY late
        // finish (actualEnd > originalEnd) against them regardless of fault.
        const theirDelay = attributedDelay.get(r.job.id)?.get(r.contactId) ?? 0;
        if (theirDelay > 0) {
          row.jobsLate++;
          daysLate = theirDelay;
          row.totalDelayDaysAttributed += theirDelay;
        } else {
          row.jobsOnTime++;
          daysLate = 0;
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
