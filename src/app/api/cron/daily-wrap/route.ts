import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendPushToSiteAudience } from "@/lib/push";
import { format, addDays } from "date-fns";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import { getUserSiteIds } from "@/lib/site-access";
import { whereOrdersForSite } from "@/lib/order-scope";
import { fetchWeatherForPostcode } from "@/lib/weather";
import { logEvent } from "@/lib/event-log";
import { checkCronAuth } from "@/lib/cron-auth";
import type { NotificationType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-wrap
 *
 * (May 2026 Keith request) The end-of-day counterpart to the morning
 * daily-email cron.
 *
 * Fires at 18:00 UTC (≈ EOD UK across the year). For each active site
 * it summarises *what happened today* (jobs completed, snags raised,
 * deliveries received) and *what's lined up tomorrow* (starts +
 * weather). Sends both:
 *   - a per-manager email aggregating every site they can access, and
 *   - a per-site push so the audience gets a quick nudge on mobile.
 *
 * Recipients of the email: anyone in the manager roles (CEO,
 * DIRECTOR, SITE_MANAGER) who can access ≥1 site. Push recipients are
 * the site-audience the existing helper computes — assignee + every
 * UserSite member + execs, minus explicit mutes, minus anyone whose
 * NotificationPreference for JOBS_STARTING_TODAY is disabled (reused
 * as the closest existing "daily summary" preference until we add a
 * dedicated DAILY_WRAP NotificationType).
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
  const dayStart = getServerStartOfDay(req);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const tomorrowStart = dayEnd;
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 86_400_000);
  const dateLabel = format(now, "EEEE d MMMM");
  const todayStr = format(now, "yyyy-MM-dd");

  // (R12) ACTIVE only. The daily wrap is push + email — it makes no data
  // updates, so excluding ON_HOLD here is the "data only for ON_HOLD"
  // outcome (a paused site generates no evening wrap push or digest row).
  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, postcode: true },
  });
  if (sites.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No active sites" });
  }

  // Per-site digest. Each promise resolves to a single object — kept
  // independent so a failure on one site doesn't break the rest.
  // (Jun 2026 audit) That comment used to be a lie: Promise.all rejects
  // wholesale on the first failure, so one broken site killed every
  // push AND every manager email. allSettled + filter delivers it.
  const siteDigestResults = await Promise.allSettled(
    sites.map(async (site) => {
      const [
        jobsCompletedToday,
        snagsRaisedToday,
        deliveriesIn,
        photosToday,
        notesToday,
        jobsStartingTomorrow,
      ] = await Promise.all([
        prisma.job.count({
          where: {
            plot: { siteId: site.id },
            status: "COMPLETED",
            // actualEndDate is the SSoT for "finished on this day"
            actualEndDate: { gte: dayStart, lt: dayEnd },
            children: { none: {} },
          },
        }),
        prisma.snag.count({
          where: {
            plot: { siteId: site.id },
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        // (Jun 2026 audit) whereOrdersForSite SSoT — the hand-rolled OR
        // missed plot-attached one-off orders.
        prisma.materialOrder.count({
          where: {
            ...whereOrdersForSite(site.id),
            status: "DELIVERED",
            deliveredDate: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.jobPhoto.count({
          where: {
            job: { plot: { siteId: site.id } },
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.plotJournalEntry.count({
          where: {
            plot: { siteId: site.id },
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.job.count({
          where: {
            plot: { siteId: site.id },
            startDate: { gte: tomorrowStart, lt: tomorrowEnd },
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
            children: { none: {} },
          },
        }),
      ]);

      // Weather preview for tomorrow — best-effort, null on miss.
      let tomorrowWeather: { category: string; tempMin: number; tempMax: number } | null = null;
      if (site.postcode) {
        try {
          const forecast = await fetchWeatherForPostcode(site.postcode);
          const tomorrowStr = addDays(now, 1).toISOString().split("T")[0];
          const day = forecast?.find((d) => d.date === tomorrowStr);
          if (day) {
            tomorrowWeather = {
              category: day.category,
              tempMin: day.tempMin,
              tempMax: day.tempMax,
            };
          }
        } catch {}
      }

      return {
        site,
        jobsCompletedToday,
        snagsRaisedToday,
        deliveriesIn,
        photosToday,
        notesToday,
        jobsStartingTomorrow,
        tomorrowWeather,
      };
    }),
  );
  const siteDigests = siteDigestResults.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  const digestFailures = siteDigestResults.length - siteDigests.length;

  const CATEGORY_LABELS: Record<string, string> = {
    clear: "Clear",
    partly_cloudy: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Foggy",
    rain: "Rain",
    snow: "Snow",
    thunder: "Thunderstorms",
  };

  function buildWrapHtml(digests: typeof siteDigests): string {
    const lines: string[] = [];
    lines.push(
      `<h2 style="font-family:system-ui,sans-serif;margin:0 0 12px;font-size:18px;color:#0f172a">End of day — ${dateLabel}</h2>`,
    );
    for (const d of digests) {
      const tomorrowParts: string[] = [];
      if (d.jobsStartingTomorrow > 0) {
        tomorrowParts.push(
          `${d.jobsStartingTomorrow} job${d.jobsStartingTomorrow === 1 ? "" : "s"} starting`,
        );
      }
      if (d.tomorrowWeather) {
        // (Jun 2026 audit) Round — Open-Meteo returns decimals and the
        // Brief UI rounds; "8.4°–14.2°" looked untidy in the email.
        tomorrowParts.push(
          `${CATEGORY_LABELS[d.tomorrowWeather.category] ?? d.tomorrowWeather.category} ${Math.round(d.tomorrowWeather.tempMin)}°–${Math.round(d.tomorrowWeather.tempMax)}°`,
        );
      }
      const tomorrowLine = tomorrowParts.length
        ? tomorrowParts.join(" · ")
        : "no jobs scheduled";
      lines.push(
        `<div style="font-family:system-ui,sans-serif;margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
          <div style="font-weight:600;color:#0f172a;margin-bottom:6px;">${escapeHtml(d.site.name)}</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.6;">
            <li>${d.jobsCompletedToday} job${d.jobsCompletedToday === 1 ? "" : "s"} completed</li>
            <li>${d.snagsRaisedToday} snag${d.snagsRaisedToday === 1 ? "" : "s"} raised</li>
            <li>${d.deliveriesIn} deliver${d.deliveriesIn === 1 ? "y" : "ies"} received</li>
            <li>${d.photosToday + d.notesToday} photo/note${d.photosToday + d.notesToday === 1 ? "" : "s"} added</li>
            <li>Tomorrow: ${tomorrowLine}</li>
          </ul>
        </div>`,
      );
    }
    lines.push(
      `<p style="font-family:system-ui,sans-serif;font-size:11px;color:#94a3b8;margin:16px 0 0">Sight Manager · end-of-day wrap</p>`,
    );
    return lines.join("");
  }

  // Per-site push fan-out.
  await Promise.allSettled(
    siteDigests.map((d) => {
      const interesting =
        d.jobsCompletedToday +
        d.snagsRaisedToday +
        d.deliveriesIn +
        d.jobsStartingTomorrow;
      if (interesting === 0) return Promise.resolve();
      const bodyParts: string[] = [];
      if (d.jobsCompletedToday > 0)
        bodyParts.push(`${d.jobsCompletedToday} done`);
      if (d.snagsRaisedToday > 0)
        bodyParts.push(`${d.snagsRaisedToday} snag${d.snagsRaisedToday === 1 ? "" : "s"}`);
      if (d.deliveriesIn > 0)
        bodyParts.push(`${d.deliveriesIn} deliver${d.deliveriesIn === 1 ? "y" : "ies"}`);
      if (d.jobsStartingTomorrow > 0)
        bodyParts.push(`${d.jobsStartingTomorrow} starting tomorrow`);
      return sendPushToSiteAudience(
        d.site.id,
        "JOBS_STARTING_TODAY" as NotificationType,
        {
          title: `Day wrap — ${d.site.name}`,
          body: bodyParts.join(" · "),
          url: `/sites/${d.site.id}?tab=daily-brief`,
          tag: `daily-wrap-${d.site.id}-${todayStr}`,
        },
      );
    }),
  );

  // Per-manager email aggregating their accessible sites.
  // (Jun 2026 audit) SUPER_ADMIN included — daily-email was explicitly
  // fixed to include them (May 2026 B-11: "they bypass every permission
  // elsewhere"); the evening wrap silently left them out.
  const managers = await prisma.user.findMany({
    where: {
      // (R2) CONTRACT_MANAGER added to match the morning daily-email list
      // — both ends of the day now reach the same manager audience.
      role: { in: ["SUPER_ADMIN", "CEO", "DIRECTOR", "SITE_MANAGER", "CONTRACT_MANAGER"] },
      archivedAt: null,
    },
    select: { id: true, role: true, email: true, name: true },
  });

  let skippedNoAccess = 0;
  const results = await Promise.allSettled(
    managers
      .filter((m) => m.email && m.email.length > 0)
      .map(async (m) => {
        const accessibleSiteIds = await getUserSiteIds(m.id, m.role);
        const myDigests =
          accessibleSiteIds === null
            ? siteDigests
            : siteDigests.filter((d) =>
                accessibleSiteIds.includes(d.site.id),
              );
        if (myDigests.length === 0) {
          skippedNoAccess++;
          return;
        }
        return sendEmail({
          to: m.email!,
          subject: `End of day wrap — ${dateLabel}`,
          html: buildWrapHtml(myDigests),
        });
      }),
  );

  // (Jun 2026 audit) Truthy value only — skipped managers fulfil with
  // undefined and were counted as "sent" in the event log.
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.filter((r) => r.status === "rejected").length;

  await logEvent(prisma, {
    type: "NOTIFICATION",
    description: `Daily wrap sent to ${sent} manager${sent === 1 ? "" : "s"}${failed > 0 ? ` (${failed} failed)` : ""}${skippedNoAccess > 0 ? ` (${skippedNoAccess} skipped — no accessible sites)` : ""}`,
  });

  return NextResponse.json({
    sent,
    failed,
    skippedNoAccess,
    digestFailures,
    sites: sites.length,
    date: todayStr,
  });
}
