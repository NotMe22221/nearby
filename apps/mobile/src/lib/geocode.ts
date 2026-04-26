import { googlePlacesApiKey } from "./config";

/**
 * Geocode a street address. Prefers Google when a key is configured;
 * otherwise uses OpenStreetMap Nominatim (slower, rate-limited — OK for
 * one-off saves when merchants pin their storefront).
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim();
  if (!q) return null;

  if (googlePlacesApiKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${googlePlacesApiKey}`,
      );
      const json = await res.json();
      if (json.results?.length) {
        const loc = json.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      }
    } catch {
      /* try Nominatim */
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "CityWallet-Mobile/0.1 (merchant address geocoding)" } },
    );
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    if (Array.isArray(json) && json[0]?.lat != null && json[0]?.lon != null) {
      return {
        lat: parseFloat(json[0].lat!),
        lng: parseFloat(json[0].lon!),
      };
    }
  } catch {
    /* non-fatal */
  }
  return null;
}
