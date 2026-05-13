/**
 * Weather icon picker used across the Daily Brief surfaces — header
 * forecast strip, today's hero icon, snag-back-context display.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx so other
 * sections (and future surfaces like SiteCalendar) can reuse the
 * same category→icon mapping without duplicating the switch.
 *
 * Category strings come from `lib/weather.ts` and must stay in lock-
 * step with the cron's WeatherCategory enum. Unknown categories fall
 * back to a generic cloud — the cron never returns one but mock data
 * during tests sometimes does.
 */

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Snowflake,
  Sun,
} from "lucide-react";

export const WEATHER_CATEGORY_LABELS: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly Cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};

export function WeatherIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const cn = className || "size-5";
  switch (category) {
    case "clear":
      return <Sun className={cn} />;
    case "partly_cloudy":
      return <Cloud className={cn} />;
    case "cloudy":
      return <Cloud className={cn} />;
    case "fog":
      return <CloudFog className={cn} />;
    case "rain":
      return <CloudRain className={cn} />;
    case "snow":
      return <Snowflake className={cn} />;
    case "thunder":
      return <CloudLightning className={cn} />;
    default:
      return <Cloud className={cn} />;
  }
}
