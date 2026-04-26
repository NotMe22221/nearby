import { readEnv } from "@/lib/supabase/env";

export type CurrentWeather = {
  temp_c: number;
  feels_like_c: number;
  condition: string; // e.g. "Rain", "Clouds"
  description: string; // e.g. "light rain"
  wind_kph: number;
  humidity: number;
};

const cache = new Map<string, { value: CurrentWeather | null; expires: number }>();
const TTL_MS = 15 * 60 * 1000;

function keyFor(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * Fetch real current weather from OpenWeatherMap.
 * Returns null if no API key is configured or the call fails.
 */
export async function getCurrentWeather(
  lat: number,
  lng: number,
): Promise<CurrentWeather | null> {
  const key = readEnv("OPENWEATHER_API_KEY");
  if (!key) return null;

  const cacheKey = keyFor(lat, lng);
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", key);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      cache.set(cacheKey, { value: null, expires: Date.now() + 60_000 });
      return null;
    }
    const json = (await res.json()) as {
      main?: { temp?: number; feels_like?: number; humidity?: number };
      weather?: Array<{ main?: string; description?: string }>;
      wind?: { speed?: number };
    };
    const value: CurrentWeather = {
      temp_c: Math.round(json.main?.temp ?? 0),
      feels_like_c: Math.round(json.main?.feels_like ?? json.main?.temp ?? 0),
      condition: json.weather?.[0]?.main ?? "Clear",
      description: json.weather?.[0]?.description ?? "clear",
      wind_kph: Math.round((json.wind?.speed ?? 0) * 3.6),
      humidity: json.main?.humidity ?? 0,
    };
    cache.set(cacheKey, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch {
    cache.set(cacheKey, { value: null, expires: Date.now() + 60_000 });
    return null;
  }
}
