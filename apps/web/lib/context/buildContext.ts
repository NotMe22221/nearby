import { getCurrentWeather } from "@/lib/weather/openweather";
import { findActiveSlowWindow } from "@/lib/time/slowHours";
import { getNearbyEvents } from "@/lib/events/ticketmaster";
import type {
  EventSnapshot,
  Item,
  Location,
  OfferContextSnapshot,
  OfferRule,
} from "@/lib/supabase/types";

export type LoyaltyHint = {
  stamps: number;
  required: number;
  reward_text: string;
};

export type OfferContext = {
  location: Pick<Location, "id" | "name" | "address" | "lat" | "lng" | "organization_id">;
  rule: OfferRule;
  items: Item[];
  distance_km: number | null;
  snapshot: OfferContextSnapshot;
  loyalty?: LoyaltyHint | null;
};

/**
 * Build a complete real-world context object for an eligible (location, rule)
 * pair. Returns null if the location is not in a slow window right now or has
 * no eligible items.
 */
export async function buildOfferContext(params: {
  location: Pick<
    Location,
    "id" | "name" | "address" | "lat" | "lng" | "slow_hours" | "organization_id"
  >;
  rule: OfferRule;
  ruleItems: Item[];
  distance_km: number | null;
  now?: Date;
  loyalty?: LoyaltyHint | null;
}): Promise<OfferContext | null> {
  const { location, rule, ruleItems, distance_km, loyalty } = params;
  const now = params.now ?? new Date();

  if (location.lat == null || location.lng == null) return null;

  const slow = findActiveSlowWindow(location.slow_hours, now);
  if (!slow) return null;

  const items = ruleItems.filter((i) => i.offer_eligible);
  if (items.length === 0) return null;

  const [weather, events] = await Promise.all([
    getCurrentWeather(location.lat, location.lng),
    getNearbyEvents(location.lat, location.lng, 5).catch(() => [] as EventSnapshot[]),
  ]);

  const snapshot: OfferContextSnapshot = {
    weather: weather
      ? {
          temp_c: weather.temp_c,
          condition: weather.condition,
          description: weather.description,
        }
      : null,
    local_time_iso: now.toISOString(),
    day_of_week: now.getDay(),
    slow_hour_reason: slow.reason,
    events,
    loyalty_hint: loyalty ?? null,
  };

  return {
    location: {
      id: location.id,
      name: location.name,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
      organization_id: location.organization_id,
    },
    rule,
    items,
    distance_km,
    snapshot,
    loyalty: loyalty ?? null,
  };
}
