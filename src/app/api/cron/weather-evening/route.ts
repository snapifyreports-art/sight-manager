import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchWeatherForPostcode } from "@/lib/weather";
import { sendPushToSiteAudience } from "@/lib/push";
import { addDays } from "date-fns";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import type { NotificationType } from "@prisma/client";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly Cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};

/**
 * GET /api/cron/weather-evening
 *
 * Runs at 17:00 UTC (≈ end of working day in the UK across the
 * year) so site managers see "Rain expected tomorrow → 6 jobs at
 * risk" while there's still time to ring round contractors before
 * they leave home in the morning.
 *
 * The 05:00 weather cron already covers the morning-of ping AND
 * does the per-day SYSTEM event logging — this route deliberately
 * does NOT log so the two crons don't double-write. It just fans
 * out a push per affected site.
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
  const tomorrow = addDays(now, 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE", postcode: { not: null } },
    select: { id: true, name: true, postcode: true },
  });

  let pinged = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites) {
    if (!site.postcode) continue;

    try {
      const forecast = await fetchWeatherForPostcode(site.postcode);
      if (!forecast || forecast.length === 0) {
        failed++;
        continue;
      }

      const tomorrowDay = forecast.find((d) => d.date === tomorrowStr);
      if (!tomorrowDay) {
        skipped++;
        continue;
      }

      const isRainy = ["rain", "snow", "thunder"].includes(
        tomorrowDay.category,
      );
      const isCold = tomorrowDay.tempMin <= 2;
      if (!isRainy && !isCold) {
        skipped++;
        continue;
      }

      // Weather-sensitive jobs that overlap tomorrow.
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setUTCHours(23, 59, 59, 999);
      const atRiskCount = await prisma.job.count({
        where: {
          plot: { siteId: site.id },
          weatherAffected: true,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          startDate: { lte: tomorrowEnd },
          endDate: { gte: dayStart },
          children: { none: {} },
        },
      });
      if (atRiskCount === 0) {
        skipped++;
        continue;
      }

      const parts: string[] = [];
      if (isRainy)
        parts.push(
          CATEGORY_LABELS[tomorrowDay.category] ?? tomorrowDay.category,
        );
      if (isCold) parts.push(`${tomorrowDay.tempMin}°C low`);

      await sendPushToSiteAudience(
        site.id,
        "WEATHER_ALERT" as NotificationType,
        {
          title: `Weather risk tomorrow — ${site.name}`,
          body: `${parts.join(", ")}. ${atRiskCount} weather-sensitive job${atRiskCount === 1 ? "" : "s"} at risk — re-check plans tonight.`,
          url: `/sites/${site.id}?tab=daily-brief`,
          tag: `weather-evening-${site.id}`,
        },
      );
      pinged++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sites: sites.length, pinged, skipped, failed });
}
