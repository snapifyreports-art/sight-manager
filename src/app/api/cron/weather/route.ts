import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchWeatherForPostcode } from "@/lib/weather";
import { startOfDay, endOfDay } from "date-fns";

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

// GET /api/cron/weather — called by Vercel Cron at 08:00 UTC daily
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayStart = startOfDay(now);
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
      // Check if today's weather is already logged for this site
      const existing = await prisma.eventLog.findFirst({
        where: {
          siteId: site.id,
          type: "SYSTEM",
          description: { startsWith: "🌤 Weather:" },
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
      const desc = `🌤 Weather: ${CATEGORY_LABELS[today.category] ?? today.category}, ${today.tempMin}°C–${today.tempMax}°C`;

      await prisma.eventLog.create({
        data: { type: "SYSTEM", description: desc, siteId: site.id },
      });

      logged++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sites: sites.length, logged, skipped, failed });
}
