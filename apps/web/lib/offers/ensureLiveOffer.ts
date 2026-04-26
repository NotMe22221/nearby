import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  buildOfferContext,
  type LoyaltyHint,
} from "@/lib/context/buildContext";
import { generateOffer } from "@/lib/llm/generateOffer";
import { generateRedemptionCode } from "./code";
import type {
  Item,
  Location,
  Offer,
  OfferRule,
  SlowHour,
} from "@/lib/supabase/types";

type EnsureParams = {
  location: Pick<
    Location,
    "id" | "name" | "address" | "lat" | "lng" | "slow_hours" | "organization_id"
  > & { slow_hours: SlowHour[] };
  rule: OfferRule;
  items: Item[];
  distance_km: number | null;
  now?: Date;
  loyalty?: LoyaltyHint | null;
};

/**
 * Returns a live (unexpired, with capacity) offer for the given (location, rule).
 * Generates one via the LLM if none exists. Skips rules that aren't approved.
 */
export async function ensureLiveOffer(
  params: EnsureParams,
): Promise<Offer | null> {
  const now = params.now ?? new Date();
  const supabase = createSupabaseServiceClient();

  // Phase 1 gate: only approved rules can mint offers.
  if (params.rule.status !== "approved") return null;

  // Look for an active offer first (excluding loyalty-granted ones).
  const { data: existing } = await supabase
    .from("offers")
    .select("*")
    .eq("location_id", params.location.id)
    .eq("rule_id", params.rule.id)
    .is("granted_to_session_id", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.redemptions_count < existing.max_redemptions) {
    return existing as Offer;
  }

  const ctx = await buildOfferContext({
    location: params.location,
    rule: params.rule,
    ruleItems: params.items,
    distance_km: params.distance_km,
    now,
    loyalty: params.loyalty ?? null,
  });
  if (!ctx) return null;

  const [hh, mm] = params.rule.time_window_end.split(":").map(Number);
  const ruleEnd = new Date(now);
  ruleEnd.setHours(hh ?? 23, mm ?? 59, 0, 0);
  if (ruleEnd <= now) return null;

  const generated = await generateOffer(ctx);
  const code = generateRedemptionCode(params.location.name);

  const { data: inserted, error } = await supabase
    .from("offers")
    .insert({
      location_id: params.location.id,
      rule_id: params.rule.id,
      generated_text: generated.body,
      headline: generated.headline,
      scarcity_text: generated.scarcity_text,
      discount_pct: generated.discount_pct,
      items: ctx.items.map((i) => ({
        id: i.id,
        name: i.name,
        base_price: Number(i.base_price),
        max_discount_pct: i.max_discount_pct,
      })),
      redemption_code: code,
      max_redemptions: params.rule.max_redemptions,
      redemptions_count: 0,
      expires_at: ruleEnd.toISOString(),
      context_snapshot: ctx.snapshot,
    })
    .select("*")
    .single();

  if (error) {
    console.error("ensureLiveOffer insert error", error);
    return null;
  }
  return inserted as Offer;
}
