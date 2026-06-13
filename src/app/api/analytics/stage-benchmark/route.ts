import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #180) Stage benchmarking.
 *
 * Aggregates actual stage durations across every completed leaf job
 * the caller can access, grouped by stage name. Returns mean / median
 * / p10 / p90 working-day durations + sample size, sorted by mean
 * descending so the longest-running stages float to the top.
 *
 * Operators can use this to:
 *   - Spot stages that are systematically over-running
 *   - Compare a new plot's stage durations against a baseline
 *   - Set realistic template durations
 *
 * Pure derivation — no schema additions.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (Jun 2026 hardening) Analytics route — gate on VIEW_ANALYTICS (access is
  // not permission; the /analytics nav is already VIEW_ANALYTICS-gated).
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "VIEW_ANALYTICS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const where = siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};

  const jobs = await prisma.job.findMany({
    where: {
      ...where,
      status: "COMPLETED",
      children: { none: {} },
      actualStartDate: { not: null },
      actualEndDate: { not: null },
      stageCode: { not: null },
    },
    select: {
      stageCode: true,
      actualStartDate: true,
      actualEndDate: true,
    },
  });

  // Bucket by stage. Duration = working-ish days (calendar days for now —
  // good enough for benchmarking variance; switching to differenceInWorkingDays
  // is a follow-up that needs the lib import wrapped in a Node-runtime check).
  const buckets = new Map<string, number[]>();
  for (const j of jobs) {
    if (!j.stageCode || !j.actualStartDate || !j.actualEndDate) continue;
    const days = Math.max(
      1,
      Math.round(
        (j.actualEndDate.getTime() - j.actualStartDate.getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    const arr = buckets.get(j.stageCode) ?? [];
    arr.push(days);
    buckets.set(j.stageCode, arr);
  }

  function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // (May 2026 Keith request) Round every percentile to 1 dp. The
  // `quantile` helper interpolates between samples, so a p90 falling
  // between 5 and 6 days returned 5.199999999999999 — the table
  // rendered every ugly digit. mean was already rounded; the others
  // weren't.
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const items = Array.from(buckets.entries()).map(([stage, days]) => {
    const sorted = [...days].sort((a, b) => a - b);
    const mean = days.reduce((s, x) => s + x, 0) / days.length;
    return {
      stage,
      sample: days.length,
      mean: round1(mean),
      median: round1(quantile(sorted, 0.5)),
      p10: round1(quantile(sorted, 0.1)),
      p90: round1(quantile(sorted, 0.9)),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  });
  items.sort((a, b) => b.mean - a.mean);

  return NextResponse.json({ items, sampleTotal: jobs.length });
}
