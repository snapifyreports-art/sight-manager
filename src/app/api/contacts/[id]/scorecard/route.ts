import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #179) Contractor scorecard.
 *
 * Aggregates every signal we have on a contractor's performance:
 *
 *   - Jobs assigned + completed + in-progress + open
 *   - Days late: sum(actualEndDate - endDate) across leaf jobs
 *   - Sign-off rate: signed-off / completed
 *   - Snags raised against this contractor + resolved
 *   - Average days to resolve a snag
 *   - Re-engagement: distinct sites worked
 *
 * Drives the contractor detail page and the per-contractor handover
 * pack PDF. Pure derivation — no schema additions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, name: true, company: true, type: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Jobs this contractor is on, leaf only.
  const jobLinks = await prisma.jobContractor.findMany({
    where: { contactId: id, job: { children: { none: {} } } },
    select: {
      job: {
        select: {
          id: true,
          status: true,
          endDate: true,
          actualEndDate: true,
          signedOffAt: true,
          plot: { select: { siteId: true } },
        },
      },
    },
  });
  const jobs = jobLinks.map((j) => j.job);

  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const inProgress = jobs.filter((j) => j.status === "IN_PROGRESS");
  const notStarted = jobs.filter((j) => j.status === "NOT_STARTED");
  const signedOff = completed.filter((j) => j.signedOffAt);

  // Days late: leaf jobs where actualEndDate > endDate (planned).
  let daysLateTotal = 0;
  let daysLateJobs = 0;
  for (const j of completed) {
    if (!j.endDate || !j.actualEndDate) continue;
    if (j.actualEndDate.getTime() > j.endDate.getTime()) {
      const days = Math.ceil(
        (j.actualEndDate.getTime() - j.endDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      daysLateTotal += days;
      daysLateJobs += 1;
    }
  }
  const onTime = completed.length - daysLateJobs;

  // Snags raised against this contractor.
  const snags = await prisma.snag.findMany({
    where: { contactId: id },
    select: { status: true, createdAt: true, resolvedAt: true },
  });
  const snagsResolved = snags.filter(
    (s) => s.status === "RESOLVED" || s.status === "CLOSED",
  );
  const snagsOpen = snags.filter(
    (s) => s.status === "OPEN" || s.status === "IN_PROGRESS",
  );

  let avgSnagResolveDays: number | null = null;
  if (snagsResolved.length > 0) {
    const sum = snagsResolved.reduce((s, snag) => {
      if (!snag.resolvedAt) return s;
      return (
        s + (snag.resolvedAt.getTime() - snag.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );
    }, 0);
    avgSnagResolveDays = Math.round((sum / snagsResolved.length) * 10) / 10;
  }

  const distinctSites = new Set(jobs.map((j) => j.plot.siteId)).size;

  // Composite "score" — 0..100. Designed to be directionally honest
  // rather than statistically tight: combines on-time rate (40%),
  // sign-off rate (20%), snag rate (20%, inverted), re-engagement
  // bonus (20%, log-scaled on distinct sites). NaN-safe.
  const onTimeRate = completed.length > 0 ? onTime / completed.length : 1;
  const signOffRate = completed.length > 0 ? signedOff.length / completed.length : 1;
  const snagRate = jobs.length > 0 ? Math.min(snags.length / jobs.length, 1) : 0;
  const siteBonus = Math.min(Math.log2(distinctSites + 1) / 4, 1); // 1 site = .35, 3 = .5, 15 = 1
  const rawScore =
    onTimeRate * 0.4 + signOffRate * 0.2 + (1 - snagRate) * 0.2 + siteBonus * 0.2;
  const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

  return NextResponse.json({
    contact,
    jobs: {
      total: jobs.length,
      completed: completed.length,
      inProgress: inProgress.length,
      notStarted: notStarted.length,
    },
    onTime,
    daysLateJobs,
    daysLateTotal,
    onTimeRate: Math.round(onTimeRate * 100),
    signedOff: signedOff.length,
    signOffRate: Math.round(signOffRate * 100),
    snagsRaised: snags.length,
    snagsResolved: snagsResolved.length,
    snagsOpen: snagsOpen.length,
    avgSnagResolveDays,
    distinctSites,
    score,
  });
}
