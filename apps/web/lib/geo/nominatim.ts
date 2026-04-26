import { readEnv } from "@/lib/supabase/env";

export type GeocodeResult = {
  lat: number;
  lng: number;
  display_name: string;
};

const cache = new Map<string, { value: GeocodeResult | null; expires: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Geocode a free-form address using the OpenStreetMap Nominatim API (no key required).
 * Per Nominatim usage policy we set a User-Agent and throttle via in-memory cache.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const ua =
    readEnv("NOMINATIM_USER_AGENT") ||
    "city-wallet-demo (https://github.com/example/city-wallet)";

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": ua, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    cache.set(key, { value: null, expires: Date.now() + 60_000 });
    return null;
  }
  const json = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  if (!json.length) {
    cache.set(key, { value: null, expires: Date.now() + 60_000 });
    return null;
  }
  const result: GeocodeResult = {
    lat: parseFloat(json[0].lat),
    lng: parseFloat(json[0].lon),
    display_name: json[0].display_name,
  };
  cache.set(key, { value: result, expires: Date.now() + TTL_MS });
  return result;
}
