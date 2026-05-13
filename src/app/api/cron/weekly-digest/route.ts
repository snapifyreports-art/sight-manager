import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { format, subDays } from "date-fns";
import { checkCronAuth } from "@/lib/cron-auth";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #153) Weekly digest email.
 *
 * Sent Monday 7am UTC. For each user with at least one watched OR
 * assigned site, sends a per-user email summarising the past 7 days
 * across THEIR sites only:
 *
 *   - Jobs started + completed
 *   - Snags raised + resolved
 *   - Photos uploaded
 *   - Delay events (rained-off + cascade reasons)
 *
 * Distinct from the daily-email (which goes to managers + covers
 * "today's tasks" across all their sites). The weekly digest is a
 * lookback retrospective — what happened this week.
 *
 * Watching is the personalisation hook (#152): a watcher who isn't
 * assigned still gets digests for the sites they care about; an
 * assignee who hasn't muted gets digests for assigned sites by
 * default.
 *
 * Skip rule: a user gets no email if their week summary has zero
 * activity across all their sites — keeps inboxes clean during
 * quiet weeks.
 */
export async function GET(req: NextRequest) {
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  const now = getServerCurrentDate(req);
  const todayStart = getServerStartOfDay(req);
  const weekStart = subDays(todayStart, 7);
  const weekLabel = `${format(weekStart, "d MMM")}–${format(subDays(todayStart, 1), "d MMM")}`;

  // (#183) Every user with at least one access row (UserSite) or
  // assignment. Previously this required a watch row — opt-in. Post-
  // flip, every user with site access gets the digest by default;
  // muted sites (presence of WatchedSite row) are subtracted below.
  const users = await prisma.user.findMany({
    where: {
      email: { not: "" },
      OR: [
        { siteAccess: { some: { site: { status: { not: "COMPLETED" } } } } },
        { assignedSites: { some: { status: { not: "COMPLETED" } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      siteAccess: {
        where: { site: { status: { not: "COMPLETED" } } },
        select: { siteId: true },
      },
      assignedSites: {
        where: { status: { not: "COMPLETED" } },
        select: { id: true },
      },
      // WatchedSite rows now mean MUTED — subtract from the audience.
      watchedSites: {
        select: { siteId: true },
      },
    },
  });

  let sent = 0;
  let skippedQuiet = 0;
  const failed: Array<{ userId: string; error: string }> = [];

  for (const u of users) {
    // (#183) Default: subscribed to every accessible + assigned site.
    // Subtract any WatchedSite rows (now meaning "muted").
    const mutedIds = new Set(u.watchedSites.map((w) => w.siteId));
    const siteIds = Array.from(
      new Set([
        ...u.siteAccess.map((a) => a.siteId),
        ...u.assignedSites.map((s) => s.id),
      ]),
    ).filter((id) => !mutedIds.has(id));
    if (siteIds.length === 0) continue;

    // Fetch site names + per-site activity counts in parallel.
    const sites = await prisma.site.findMany({
      where: { id: { in: siteIds }, status: { not: "COMPLETED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (sites.length === 0) continue;

    type SiteSummary = {
      siteId: string;
      siteName: string;
      jobsStarted: number;
      jobsCompleted: number;
      snagsRaised: number;
      snagsResolved: number;
      photos: number;
      delays: number;
      // (May 2026 audit #145) Stale-snag count: open snags older than
      // 30 days. Surfaces things slipping through the cracks.
      staleSnags: number;
      // (#191) Lateness summary for the week.
      latenessOpened: number;
      latenessResolved: number;
      latenessDaysLost: number;
      latenessTopReason: string | null;
    };

    const summaries: SiteSummary[] = await Promise.all(
      sites.map(async (s) => {
        const [jobsStarted, jobsCompleted, snagsRaised, snagsResolved, photos, delays, staleSnags, latenessOpenedThisWeek, latenessResolvedThisWeek, openLatenessForWeek] =
          await Promise.all([
            prisma.job.count({
              where: {
                plot: { siteId: s.id },
                actualStartDate: { gte: weekStart, lt: todayStart },
                children: { none: {} },
              },
            }),
            prisma.job.count({
              where: {
                plot: { siteId: s.id },
                actualEndDate: { gte: weekStart, lt: todayStart },
                children: { none: {} },
              },
            }),
            prisma.snag.count({
              where: {
                plot: { siteId: s.id },
                createdAt: { gte: weekStart, lt: todayStart },
              },
            }),
            prisma.snag.count({
              where: {
                plot: { siteId: s.id },
                status: { in: ["RESOLVED", "CLOSED"] },
                resolvedAt: { gte: weekStart, lt: todayStart },
              },
            }),
            prisma.jobPhoto.count({
              where: {
                job: { plot: { siteId: s.id } },
                createdAt: { gte: weekStart, lt: todayStart },
              },
            }),
            prisma.eventLog.count({
              where: {
                siteId: s.id,
                type: "SCHEDULE_CASCADED",
                createdAt: { gte: weekStart, lt: todayStart },
              },
            }),
            prisma.snag.count({
              where: {
                plot: { siteId: s.id },
                status: { in: ["OPEN", "IN_PROGRESS"] },
                createdAt: { lt: subDays(todayStart, 30) },
              },
            }),
            // (#191) Lateness events opened this week on the site.
            prisma.latenessEvent.count({
              where: {
                siteId: s.id,
                wentLateOn: { gte: weekStart, lt: todayStart },
              },
            }),
            // (#191) Lateness events resolved this week.
            prisma.latenessEvent.count({
              where: {
                siteId: s.id,
                resolvedAt: { gte: weekStart, lt: todayStart },
              },
            }),
            // (#191) Open lateness events at end of week + their reasons,
            // so the digest can summarise total WD lost + top reason.
            prisma.latenessEvent.findMany({
              where: { siteId: s.id, resolvedAt: null },
              select: { daysLate: true, reasonCode: true },
            }),
          ]);
        // Aggregate the latenessForWeek list into total WD + top reason.
        const latenessDaysLost = openLatenessForWeek.reduce((sum, e) => sum + e.daysLate, 0);
        const reasonCounts = new Map<string, number>();
        for (const e of openLatenessForWeek) {
          reasonCounts.set(e.reasonCode, (reasonCounts.get(e.reasonCode) ?? 0) + e.daysLate);
        }
        const sortedReasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]);
        const latenessTopReason = sortedReasons.length > 0 ? sortedReasons[0][0] : null;
        return {
          siteId: s.id,
          siteName: s.name,
          jobsStarted,
          jobsCompleted,
          snagsRaised,
          snagsResolved,
          photos,
          delays,
          staleSnags,
          latenessOpened: latenessOpenedThisWeek,
          latenessResolved: latenessResolvedThisWeek,
          latenessDaysLost,
          latenessTopReason,
        };
      }),
    );

    const totalActivity = summaries.reduce(
      (acc, s) =>
        acc + s.jobsStarted + s.jobsCompleted + s.snagsRaised + s.snagsResolved + s.photos + s.delays + s.staleSnags + s.latenessOpened + s.latenessResolved,
      0,
    );

    if (totalActivity === 0) {
      skippedQuiet++;
      continue;
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://sight-manager.vercel.app";

    const siteRows = summaries
      .map((s) => {
        const stat = (label: string, n: number, color: string) =>
          n > 0
            ? `<span style="background:${color};border-radius:9999px;padding:2px 8px;font-size:11px;margin-right:6px;">${n} ${label}</span>`
            : "";
        const cells = [
          stat("started", s.jobsStarted, "#dcfce7"),
          stat("completed", s.jobsCompleted, "#bfdbfe"),
          stat("snags raised", s.snagsRaised, "#fee2e2"),
          stat("snags resolved", s.snagsResolved, "#dcfce7"),
          stat("photos", s.photos, "#e0e7ff"),
          stat("delays", s.delays, "#fef3c7"),
          // (May 2026 audit #145) Stale snag highlight in red. Catches
          // the eye in a sea of green / blue chips so a manager scrolling
          // past doesn't miss long-rotting snags.
          s.staleSnags > 0
            ? `<span style="background:#fecaca;color:#b91c1c;border-radius:9999px;padding:2px 8px;font-size:11px;margin-right:6px;font-weight:600;">${s.staleSnags} stale snag${s.staleSnags !== 1 ? "s" : ""} &gt;30d</span>`
            : "",
          // (#191) Lateness pills — opened this week (amber) + resolved (green).
          s.latenessOpened > 0
            ? `<span style="background:#fef3c7;color:#92400e;border-radius:9999px;padding:2px 8px;font-size:11px;margin-right:6px;font-weight:600;">${s.latenessOpened} went late</span>`
            : "",
          s.latenessResolved > 0
            ? `<span style="background:#dcfce7;color:#166534;border-radius:9999px;padding:2px 8px;font-size:11px;margin-right:6px;">${s.latenessResolved} lateness resolved</span>`
            : "",
        ]
          .filter(Boolean)
          .join("");
        // (#191) Lateness footer — total WD lost on currently-open events +
        // top reason. Sits below the pills so a manager scanning the digest
        // immediately sees the headline "you're 12 WD behind, mostly weather".
        const latenessFooter =
          s.latenessDaysLost > 0
            ? // (May 2026 audit B-P1-41) Clarify "lost" is cumulative
              // across all currently-open events for the site, not just
              // events that went late this week. Pre-fix the heading
              // implied this-week-only and a manager reading the email
              // alongside the in-app LatenessSummary couldn't reconcile.
              `<div style="margin-top:8px;font-size:12px;color:#92400e;"><strong>${s.latenessDaysLost} working day${s.latenessDaysLost !== 1 ? "s" : ""} lost</strong> (open across the site)${s.latenessTopReason ? ` — top reason: ${s.latenessTopReason.replace(/_/g, " ").toLowerCase()}` : ""}</div>`
            : "";
        if (!cells && !latenessFooter) return ""; // site had no activity — skip
        return `
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
            <a href="${baseUrl}/sites/${s.siteId}?tab=story" style="text-decoration:none;color:#0f172a;">
              <p style="margin:0 0 8px;font-weight:600;font-size:14px;">${s.siteName}</p>
            </a>
            <div style="font-size:12px;color:#475569;">${cells}</div>
            ${latenessFooter}
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Sight Manager</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Weekly digest — ${weekLabel}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">Hi ${u.name},</p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">Here's what happened on the sites you're watching this week.</p>
      ${siteRows}
      <div style="margin:24px 0 0;text-align:center;">
        <a href="${baseUrl}/dashboard" style="background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open dashboard</a>
      </div>
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
        You're receiving this because you watch or are assigned to one or more sites. Toggle the watch button on a site header to stop seeing it here.
      </p>
    </div>
  </div>
</body>
</html>`;

    try {
      await sendEmail({
        to: u.email,
        subject: `Weekly digest — ${weekLabel}`,
        html,
      });
      sent++;
    } catch (err) {
      failed.push({
        userId: u.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sent > 0 || failed.length > 0) {
    await prisma.eventLog.create({
      data: {
        type: "NOTIFICATION",
        description: `Weekly digest sent to ${sent} user${sent !== 1 ? "s" : ""}${failed.length > 0 ? ` (${failed.length} failed)` : ""}${skippedQuiet > 0 ? ` (${skippedQuiet} skipped — quiet week)` : ""}`,
      },
    });
  }

  return NextResponse.json({
    sent,
    skippedQuiet,
    failed: failed.length,
    week: weekLabel,
    generatedAt: now.toISOString(),
  });
}
