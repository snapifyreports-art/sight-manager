import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchWeatherForPostcode } from "@/lib/weather";
import { sendPushToSiteAudience } from "@/lib/push";
import { logEvent } from "@/lib/event-log";
import { endOfDay, addDays } from "date-fns";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import type { NotificationType } from "@prisma/client";

// (May 2026 audit B-P1-22) Weather pushes switched from sendPushToAll
// to sendPushToSiteAudience. Pre-fix 10 active sites = 10 pushes to
// every user, even users with no access to those sites — significant
// spam during multi-site rollouts. The notifications cron already
// uses sendPushToSiteAudience correctly; this brings weather in line.

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

// (May 2026 audit B-P1-20) Shared prefix for both the idempotency
// lookup and the row creation — the previous code duplicated the
// string literal in two places, so a typo or refactor in one would
// silently start double-logging weather rows. Single source = no
// drift. Still a string match (rather than a typed EventType field)
// because adding a new EventType enum requires a Prisma migration —
// will fold this into the next schema sprint.
const WEATHER_DESC_PREFIX = "🌤 Weather:";

// GET /api/cron/weather — called by Vercel Cron at 08:00 UTC daily
export async function GET(req: NextRequest) {
  const { checkCronAuth } = await import("@/lib/cron-auth");
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  // (May 2026 audit B-P0-7 / B-P1-20) Route through getServerCurrentDate
  // + getServerStartOfDay so Dev Mode replays match real-cron behaviour
  // (the rest of the crons already do this). Pre-fix the weather cron
  // used raw `new Date()` so simulated-time tests caught nothing.
  const now = getServerCurrentDate(req);
  const dayStart = getServerStartOfDay(req);
  const dayEnd = endOfDay(now);

  // Get all active sites with a postcode
  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE", postcode: { not: null } },
    select: { id: true, name: true, postcode: true },
  });

  let logged = 0;
  let skipped = 0;
  let failed = 0;

  for (const site of sites) {
    if (!site.postcode) continue;

    try {
      // Check if today's weather is already logged for this site.
      // Uses the shared WEATHER_DESC_PREFIX constant so the lookup
      // can never drift from the row format.
      const existing = await prisma.eventLog.findFirst({
        where: {
          siteId: site.id,
          type: "SYSTEM",
          description: { startsWith: WEATHER_DESC_PREFIX },
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const forecast = await fetchWeatherForPostcode(site.postcode);
      if (!forecast || forecast.length === 0) {
        failed++;
        continue;
      }

      const today = forecast[0];
      const desc = `${WEATHER_DESC_PREFIX} ${CATEGORY_LABELS[today.category] ?? today.category}, ${today.tempMin}°C–${today.tempMax}°C`;

      await logEvent(prisma, { type: "SYSTEM", description: desc, siteId: site.id });

      logged++;

      // Send daily weather summary push to this site's audience only.
      await sendPushToSiteAudience(site.id, "WEATHER_ALERT" as NotificationType, {
        title: `Weather — ${site.name}`,
        body: `Today: ${CATEGORY_LABELS[today.category] ?? today.category}, ${today.tempMin}°C–${today.tempMax}°C`,
        url: `/sites/${site.id}?tab=programme`,
        tag: `weather-daily-${site.id}`,
      });

      // Check tomorrow's forecast for weather alert
      const tomorrowStr = addDays(now, 1).toISOString().split("T")[0];
      const tomorrow = forecast.find((d) => d.date === tomorrowStr);
      if (tomorrow) {
        const isRainy = ["rain", "snow", "thunder"].includes(tomorrow.category);
        const isCold = tomorrow.tempMin <= 2;

        if (isRainy || isCold) {
          // Check if there are weather-sensitive jobs starting in the next 3 days
          const in3Days = addDays(now, 3);
          const weatherSensitiveJobCount = await prisma.job.count({
            where: {
              plot: { siteId: site.id },
              weatherAffected: true,
              status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
              startDate: { lte: in3Days },
              children: { none: {} },
            },
          });

          if (weatherSensitiveJobCount > 0) {
            const alertParts: string[] = [];
            if (isRainy) alertParts.push(CATEGORY_LABELS[tomorrow.category] ?? tomorrow.category);
            if (isCold) alertParts.push(`${tomorrow.tempMin}°C low`);

            await sendPushToSiteAudience(site.id, "WEATHER_ALERT" as NotificationType, {
              title: `Weather Alert — ${site.name}`,
              body: `Tomorrow: ${alertParts.join(", ")}. ${weatherSensitiveJobCount} weather-sensitive job${weatherSensitiveJobCount !== 1 ? "s" : ""} at risk.`,
              url: `/sites/${site.id}`,
              tag: `weather-alert-${site.id}`,
            });
          }
        }
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sites: sites.length, logged, skipped, failed });
}
