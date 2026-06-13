// Shared weather utilities — used by /api/weather and /api/sites/[id]/daily-brief

// WMO Weather interpretation codes → simple category
export function weatherCategory(code: number): string {
  if (code <= 1) return "clear";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code >= 45 && code <= 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  category: string;
  tempMax: number;
  tempMin: number;
}

/**
 * (R1) Single source of truth for "is this day's weather risky enough
 * to push a site alert about". Risky = a wet/icy category (rain / snow /
 * thunder) OR a temperature extreme (a cold low that risks frost / a
 * heatwave high). The weather + weather-evening crons reuse this so the
 * morning summary push and the evening tomorrow-alert push agree on what
 * counts as risky. The unconditional daily EventLog row does NOT use this
 * — it always records the forecast regardless of risk.
 */
export function isWeatherRisky(day: {
  category: string;
  tempMin: number;
  tempMax: number;
}): boolean {
  const riskyCategory = ["rain", "snow", "thunder"].includes(day.category);
  // Cold low (frost / icy-ground risk) or a heatwave high — both stop
  // outdoor trades or need precautions on site.
  const coldExtreme = day.tempMin <= 2;
  const hotExtreme = day.tempMax >= 30;
  return riskyCategory || coldExtreme || hotExtreme;
}

const CATEGORY_LABEL: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorm",
};

/**
 * Return a short weather summary string for today's conditions at a postcode.
 * e.g. "Rain, 14°C max / 8°C min"
 * Returns null if the postcode is unavailable or the fetch fails.
 */
export async function getTodayWeatherSummary(postcode: string): Promise<string | null> {
  const forecast = await fetchWeatherForPostcode(postcode);
  if (!forecast) return null;
  const todayStr = new Date().toISOString().split("T")[0];
  const today = forecast.find((d) => d.date === todayStr) ?? forecast[0];
  if (!today) return null;
  const label = CATEGORY_LABEL[today.category] ?? today.category;
  return `${label}, ${today.tempMax}°C max / ${today.tempMin}°C min`;
}

/**
 * Fetch weather forecast for a UK postcode.
 * Uses postcodes.io (free) for geocoding + Open-Meteo (free) for forecast.
 * Returns null if postcode is invalid or APIs fail.
 */
export async function fetchWeatherForPostcode(
  postcode: string
): Promise<WeatherDay[] | null> {
  try {
    // Step 1: Convert UK postcode → lat/lng
    const geoRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
      { next: { revalidate: 86400 } } as RequestInit & { next?: { revalidate?: number } }
    );
    if (!geoRes.ok) return null;

    const geoData = await geoRes.json();
    const { latitude, longitude } = geoData.result;

    // Step 2: Fetch 7-day forecast from Open-Meteo
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FLondon&forecast_days=7`,
      { next: { revalidate: 3600 } } as RequestInit & { next?: { revalidate?: number } }
    );
    if (!weatherRes.ok) return null;

    const weatherData = await weatherRes.json();

    return weatherData.daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: weatherData.daily.weather_code[i],
      category: weatherCategory(weatherData.daily.weather_code[i]),
      tempMax: weatherData.daily.temperature_2m_max[i],
      tempMin: weatherData.daily.temperature_2m_min[i],
    }));
  } catch {
    return null;
  }
}
