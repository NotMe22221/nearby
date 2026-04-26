/**
 * Mirrors the mobile “Nearby” search UX for the web home feed.
 * (Mobile uses shared logic in `apps/mobile/src/lib/places.ts`.)
 */

export type PlaceCategoryId =
  | "all"
  | "coffee"
  | "bakery"
  | "bar"
  | "restaurant"
  | "store";

export const PLACE_CATEGORY_CHIPS: { id: PlaceCategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "coffee", label: "Coffee" },
  { id: "bakery", label: "Bakery" },
  { id: "bar", label: "Bar" },
  { id: "restaurant", label: "Restaurants" },
  { id: "store", label: "Grocery" },
];

const WEB_CATEGORY_HINTS: Record<PlaceCategoryId, string[] | null> = {
  all: null,
  coffee: ["coffee", "cafe", "espresso", "latte", "mocha", "roast"],
  bakery: ["baker", "baked", "donut", "donuts", "pastry", "croissant", "bagel", "dough"],
  bar: ["bar", "pub", "brewery", "wine", "taproom", "cocktail"],
  restaurant: ["restaurant", "bistro", "diner", "grill", "kitchen", "taco", "pizza", "sushi", "eat"],
  store: ["market", "grocery", "shop", "retail", "convenience", "mart", "foods"],
};

export function webFeedTextMatchesCategory(
  id: PlaceCategoryId,
  textLower: string,
): boolean {
  if (id === "all") return true;
  const hints = WEB_CATEGORY_HINTS[id];
  if (!hints?.length) return true;
  return hints.some((h) => textLower.includes(h));
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function offerMatchesSearch(
  o: { headline: string; generated_text: string; merchant_name: string; merchant_address: string },
  q: string,
  category: PlaceCategoryId,
): boolean {
  const combined = [o.headline, o.generated_text, o.merchant_name, o.merchant_address]
    .join(" ")
    .toLowerCase();
  if (norm(q) && !combined.includes(norm(q))) return false;
  if (!webFeedTextMatchesCategory(category, combined)) return false;
  return true;
}

export function merchantMatchesSearch(
  m: { name: string; address: string },
  q: string,
  category: PlaceCategoryId,
): boolean {
  const combined = `${m.name} ${m.address}`.toLowerCase();
  if (norm(q) && !combined.includes(norm(q))) return false;
  if (!webFeedTextMatchesCategory(category, combined)) return false;
  return true;
}
