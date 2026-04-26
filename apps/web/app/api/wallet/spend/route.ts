import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { generateRedemptionCode } from "@/lib/offers/code";
import type { Item, Location, OfferContextSnapshot } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Customers can spend points to mint a one-time offer at any merchant they
// have a balance with. Cost is fixed at 200 points per granted offer (a 10%
// off coupon on one eligible item).
const POINTS_COST = 200;
const GRANT_DISCOUNT = 10;
const GRANT_TTL_MIN = 60;

export async function POST(req: Request) {
  let body: { session_id?: string; organization_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const { session_id, organization_id } = body;
  if (!session_id || !organization_id) {
    return NextResponse.json(
      { error: "session_id and organization_id required" },
      { status: 400 },
    );
  }

  const svc = createSupabaseServiceClient();

  // Sum the customer's point balance at this org.
  const { data: ledger, error: ledgerErr } = await svc
    .from("point_ledger")
    .select("delta")
    .eq("customer_session_id", session_id)
    .eq("organization_id", organization_id);
  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }
  const balance = (ledger ?? []).reduce(
    (sum, r) => sum + (r.delta as number),
    0,
  );
  if (balance < POINTS_COST) {
    return NextResponse.json(
      { error: `Need ${POINTS_COST} points, have ${balance}.` },
      { status: 400 },
    );
  }

  // Pick a location + an offer-eligible item to attach.
  const { data: locations } = await svc
    .from("locations")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: true })
    .limit(1);
  const location = (locations as Location[] | null)?.[0];
  if (!location) {
    return NextResponse.json(
      { error: "Merchant has no locations." },
      { status: 404 },
    );
  }

  const { data: items } = await svc
    .from("items")
    .select("*")
    .eq("location_id", location.id)
    .eq("offer_eligible", true)
    .limit(1);
  const item = (items as Item[] | null)?.[0];
  if (!item) {
    return NextResponse.json(
      { error: "No eligible items at this merchant right now." },
      { status: 404 },
    );
  }

  const now = new Date();
  const expires = new Date(now.getTime() + GRANT_TTL_MIN * 60_000);
  const snapshot: OfferContextSnapshot = {
    weather: null,
    local_time_iso: now.toISOString(),
    day_of_week: now.getDay(),
    slow_hour_reason: "Loyalty grant — points spend",
    events: [],
    loyalty_hint: null,
  };

  const code = generateRedemptionCode(location.name);
  const headline = `Loyalty perk: ${GRANT_DISCOUNT}% off ${item.name}`;
  const generated_text = `Thanks for sticking with us — enjoy ${GRANT_DISCOUNT}% off ${item.name} on the house. Show this code at the counter within the next hour.`;

  const { data: granted, error: insertErr } = await svc
    .from("offers")
    .insert({
      location_id: location.id,
      rule_id: null,
      generated_text,
      headline,
      scarcity_text: `Granted with ${POINTS_COST} loyalty points`,
      discount_pct: GRANT_DISCOUNT,
      items: [
        {
          id: item.id,
          name: item.name,
          base_price: Number(item.base_price),
          max_discount_pct: item.max_discount_pct,
        },
      ],
      redemption_code: code,
      max_redemptions: 1,
      redemptions_count: 0,
      expires_at: expires.toISOString(),
      context_snapshot: snapshot,
      granted_to_session_id: session_id,
    })
    .select("*")
    .single();
  if (insertErr || !granted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to mint offer." },
      { status: 500 },
    );
  }

  // Spend the points (negative ledger entry) and record the loyalty redemption.
  await svc.from("point_ledger").insert({
    customer_session_id: session_id,
    organization_id,
    delta: -POINTS_COST,
    reason: `spent_for_offer:${granted.id}`,
  });
  await svc.from("loyalty_redemptions").insert({
    customer_session_id: session_id,
    kind: "points",
    points_spent: POINTS_COST,
    granted_offer_id: granted.id,
  });

  return NextResponse.json({ offer_id: granted.id, code });
}
