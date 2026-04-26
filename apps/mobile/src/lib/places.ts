import { googlePlacesApiKey } from "./config";

const BASE = "https://places.googleapis.com/v1";

export interface PlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

export interface Place {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  currentOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  regularOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  photos?: PlacePhoto[];
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.photos",
].join(",");

const DETAIL_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "primaryType",
  "currentOpeningHours",
  "regularOpeningHours",
  "nationalPhoneNumber",
  "websiteUri",
  "photos",
].join(",");

export async function searchNearbyBusinesses(
  lat: number,
  lng: number,
  radiusMeters = 5000,
): Promise<Place[]> {
  if (!googlePlacesApiKey) return [];

  const res = await fetch(`${BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googlePlacesApiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ["restaurant", "cafe", "bakery", "bar", "store"],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return (json.places as Place[]) ?? [];
}

export async function getPlaceDetails(placeId: string): Promise<Place> {
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": googlePlacesApiKey,
      "X-Goog-FieldMask": DETAIL_FIELD_MASK,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Place Details error ${res.status}: ${text}`);
  }

  return (await res.json()) as Place;
}

export function getPlacePhotoUrl(
  photoName: string,
  maxWidth = 400,
): string {
  return `${BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${googlePlacesApiKey}`;
}

const TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  bakery: "Bakery",
  bar: "Bar",
  store: "Store",
  coffee_shop: "Coffee Shop",
  pizza_restaurant: "Pizza",
  fast_food_restaurant: "Fast Food",
  sandwich_shop: "Sandwiches",
  ice_cream_shop: "Ice Cream",
  meal_takeaway: "Takeaway",
  meal_delivery: "Delivery",
};

export function formatType(primaryType?: string): string {
  if (!primaryType) return "Business";
  return TYPE_LABELS[primaryType] ?? primaryType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TYPE_OFFERS: Record<string, string[]> = {
  restaurant: ["15% off your meal", "Free appetizer with entree"],
  cafe: ["Buy 1 get 1 free coffee", "20% off any drink"],
  bakery: ["BOGO pastries", "15% off fresh bread"],
  bar: ["Happy hour: $5 drinks", "10% off your tab"],
  store: ["15% off your purchase", "Buy 2 get 1 free"],
  coffee_shop: ["Free size upgrade", "15% off any latte"],
};

export function generateOffer(primaryType?: string): string {
  const key = primaryType ?? "store";
  const offers = TYPE_OFFERS[key] ?? TYPE_OFFERS.store;
  return offers[Math.floor(Math.random() * offers.length)];
}

export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
