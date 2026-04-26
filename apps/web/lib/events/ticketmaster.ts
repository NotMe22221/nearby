import { readEnv } from "@/lib/supabase/env";
import type { EventSnapshot } from "@/lib/supabase/types";

// In-process cache: (lat3dp,lng3dp,hourBucket) -> events
const CACHE = new Map<
  string,
  { at: number; events: EventSnapshot[] }
>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(lat: number, lng: number): string {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${hourBucket}`;
}

/**
 * Fetch local events happening in the next 6 hours from Ticketmaster Discovery
 * v2. Returns an empty array if no API key is configured or the API fails.
 *
 * Cached per (lat,lng-3dp, hour) for 60 minutes to avoid hammering the API.
 */
export async function getNearbyEvents(
  lat: number,
  lng: number,
  radiusKm = 5,
): Promise<EventSnapshot[]> {
  const apiKey = readEnv("TICKETMASTER_API_KEY");
  if (!apiKey) return [];

  const key = cacheKey(lat, lng);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.events;
  }

  const startDateTime = new Date().toISOString().split(".")[0] + "Z";
  const endDateTime =
    new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().split(".")[0] + "Z";

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("latlong", `${lat},${lng}`);
  url.searchParams.set("radius", String(Math.max(1, Math.round(radiusKm))));
  url.searchParams.set("unit", "km");
  url.searchParams.set("size", "10");
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) {
      console.warn("Ticketmaster API non-200", res.status);
      CACHE.set(key, { at: Date.now(), events: [] });
      return [];
    }
    const data = (await res.json()) as TicketmasterResponse;
    const raw = data?._embedded?.events ?? [];
    const events: EventSnapshot[] = raw.map((e) => {
      const venue = e._embedded?.venues?.[0];
      const venueLat = venue?.location?.latitude
        ? Number(venue.location.latitude)
        : null;
      const venueLng = venue?.location?.longitude
        ? Number(venue.location.longitude)
        : null;
      const dist =
        venueLat != null && venueLng != null
          ? haversineKm(lat, lng, venueLat, venueLng)
          : null;
      return {
        id: e.id,
        name: e.name,
        start_at:
          e.dates?.start?.dateTime ||
          e.dates?.start?.localDate ||
          new Date().toISOString(),
        distance_km: dist,
        classification:
          e.classifications?.[0]?.segment?.name ??
          e.classifications?.[0]?.genre?.name ??
          null,
      };
    });
    CACHE.set(key, { at: Date.now(), events });
    return events;
  } catch (err) {
    console.warn("Ticketmaster fetch failed", err);
    return [];
  }
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

type TicketmasterResponse = {
  _embedded?: {
    events?: Array<{
      id: string;
      name: string;
      dates?: { start?: { dateTime?: string; localDate?: string } };
      classifications?: Array<{
        segment?: { name?: string };
        genre?: { name?: string };
      }>;
      _embedded?: {
        venues?: Array<{
          location?: { latitude?: string; longitude?: string };
        }>;
      };
    }>;
  };
};
