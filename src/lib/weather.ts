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
      { next: { revalidate: 86400 } } as any
    );
    if (!geoRes.ok) return null;

    const geoData = await geoRes.json();
    const { latitude, longitude } = geoData.result;

    // Step 2: Fetch 7-day forecast from Open-Meteo
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FLondon&forecast_days=7`,
      { next: { revalidate: 3600 } } as any
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
