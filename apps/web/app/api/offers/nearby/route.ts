import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureLiveOffer } from "@/lib/offers/ensureLiveOffer";
import { findActiveSlowWindow } from "@/lib/time/slowHours";
import { getLoyaltyHintForOrg } from "@/lib/loyalty/hint";
import type {
  Item,
  NearbyLocationRow,
  Offer,
  OfferRule,
  Organization,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export type NearbyOffer = Offer & {
  merchant_name: string;
  merchant_address: string;
  organization_id: string;
  distance_km: number;
  stripe_enabled: boolean;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radius = parseFloat(searchParams.get("radius_km") ?? "5");
  const sessionId = searchParams.get("session");

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { error: "lat and lng query params are required." },
      { status: 400 },
    );
  }

  const anon = createSupabaseServerClient();

  const { data: nearby, error: nearbyErr } = await anon.rpc(
    "locations_nearby",
    { user_lat: lat, user_lng: lng, radius_km: Math.max(0.1, radius) },
  );
  if (nearbyErr) {
    return NextResponse.json({ error: nearbyErr.message }, { status: 500 });
  }
  const locations = (nearby as NearbyLocationRow[]) ?? [];

  const now = new Date();
  const eligible = locations.filter(
    (l) => findActiveSlowWindow(l.slow_hours ?? [], now) !== null,
  );
  if (eligible.length === 0) {
    return NextResponse.json({ offers: [] });
  }

  const locationIds = eligible.map((l) => l.id);
  const orgIds = Array.from(new Set(eligible.map((l) => l.organization_id)));

  const [{ data: rules }, { data: items }, { data: orgs }] = await Promise.all([
    anon
      .from("offer_rules")
      .select("*")
      .in("location_id", locationIds)
      .eq("active", true)
      .eq("status", "approved"),
    anon.from("items").select("*").in("location_id", locationIds),
    anon
      .from("organizations")
      .select("id, stripe_account_id, stripe_charges_enabled")
      .in("id", orgIds),
  ]);

  const rulesByLocation = new Map<string, OfferRule[]>();
  ((rules as OfferRule[]) ?? []).forEach((r) => {
    const arr = rulesByLocation.get(r.location_id) ?? [];
    arr.push(r);
    rulesByLocation.set(r.location_id, arr);
  });

  const itemsById = new Map<string, Item>();
  ((items as Item[]) ?? []).forEach((i) => itemsById.set(i.id, i));

  const stripeEnabledByOrg = new Map<string, boolean>();
  ((orgs as Pick<Organization, "id" | "stripe_account_id" | "stripe_charges_enabled">[]) ?? []).forEach(
    (o) => stripeEnabledByOrg.set(o.id, !!o.stripe_account_id && !!o.stripe_charges_enabled),
  );

  const tasks: Promise<NearbyOffer | null>[] = [];
  for (const loc of eligible) {
    const locRules = rulesByLocation.get(loc.id) ?? [];
    const orgLoyaltyHint = sessionId
      ? await getLoyaltyHintForOrg(loc.organization_id, sessionId)
      : null;

    for (const rule of locRules) {
      const ruleItems = rule.item_ids
        .map((id) => itemsById.get(id))
        .filter((i): i is Item => Boolean(i));
      if (ruleItems.length === 0) continue;

      tasks.push(
        ensureLiveOffer({
          location: {
            id: loc.id,
            name: loc.name,
            address: loc.address,
            lat: loc.lat,
            lng: loc.lng,
            slow_hours: loc.slow_hours,
            organization_id: loc.organization_id,
          },
          rule,
          items: ruleItems,
          distance_km: loc.distance_km,
          now,
          loyalty: orgLoyaltyHint,
        })
          .then((offer) =>
            offer
              ? {
                  ...offer,
                  merchant_name: loc.name,
                  merchant_address: loc.address,
                  organization_id: loc.organization_id,
                  distance_km: loc.distance_km,
                  stripe_enabled: stripeEnabledByOrg.get(loc.organization_id) ?? false,
                }
              : null,
          )
          .catch((err) => {
            console.error("ensureLiveOffer error", err);
            return null;
          }),
      );
    }
  }

  const results = (await Promise.all(tasks)).filter(
    (x): x is NearbyOffer => x !== null,
  );
  const open = results.filter((o) => o.redemptions_count < o.max_redemptions);
  open.sort((a, b) => a.distance_km - b.distance_km);

  return NextResponse.json({ offers: open });
}
