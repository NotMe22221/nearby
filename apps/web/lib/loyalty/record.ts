import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { StampCard } from "@/lib/supabase/types";

/**
 * Side effects to run after a successful redemption (or after a successful
 * Stripe payment, which is also treated as a redemption).
 *
 * - Inserts a stamp_event for each active stamp_card at the org.
 * - Credits 10 points × discount tier into point_ledger.
 *
 * Safe to call from a service-role context only.
 */
export async function recordLoyaltyForRedemption(opts: {
  organization_id: string;
  customer_session_id: string;
  redemption_id: string | null;
  payment_id: string | null;
  discount_pct: number;
}) {
  const svc = createSupabaseServiceClient();

  const { data: cards } = await svc
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", opts.organization_id)
    .eq("active", true);
  const list = (cards as StampCard[] | null) ?? [];

  // Deduplicate: don't create more than one stamp_event per (card, redemption).
  // (Postgres unique index isn't installed; we just check the redemption id.)
  for (const card of list) {
    if (opts.redemption_id) {
      const { data: existing } = await svc
        .from("stamp_events")
        .select("id")
        .eq("stamp_card_id", card.id)
        .eq("customer_session_id", opts.customer_session_id)
        .eq("redemption_id", opts.redemption_id)
        .maybeSingle();
      if (existing) continue;
    }
    await svc.from("stamp_events").insert({
      stamp_card_id: card.id,
      customer_session_id: opts.customer_session_id,
      source: opts.redemption_id ? "redemption" : "purchase",
      redemption_id: opts.redemption_id,
      payment_id: opts.payment_id,
    });
  }

  // Points: 10 per discount tier (so a 20% off mints 200 points).
  const delta = Math.max(10, Math.round(opts.discount_pct * 10));
  await svc.from("point_ledger").insert({
    customer_session_id: opts.customer_session_id,
    organization_id: opts.organization_id,
    delta,
    reason: opts.redemption_id
      ? `redemption:${opts.redemption_id}`
      : opts.payment_id
        ? `payment:${opts.payment_id}`
        : "manual",
  });
}
