import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { StampCard } from "@/lib/supabase/types";

export type LoyaltyHint = {
  stamps: number;
  required: number;
  reward_text: string;
};

/**
 * Get the most-progressed stamp-card hint for the customer at this org so the
 * LLM can nudge them ("2 more stamps and you get…"). Returns null if there are
 * no active cards or the customer has never visited.
 *
 * Used by the offer generator and the wallet UI.
 */
export async function getLoyaltyHintForOrg(
  organizationId: string,
  customerSessionId: string,
): Promise<LoyaltyHint | null> {
  const svc = createSupabaseServiceClient();
  const { data: cards } = await svc
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true);
  const list = (cards as StampCard[] | null) ?? [];
  if (list.length === 0) return null;

  const cardIds = list.map((c) => c.id);
  const { data: events } = await svc
    .from("stamp_events")
    .select("stamp_card_id")
    .in("stamp_card_id", cardIds)
    .eq("customer_session_id", customerSessionId);

  const counts = new Map<string, number>();
  ((events as { stamp_card_id: string }[]) ?? []).forEach((e) => {
    counts.set(e.stamp_card_id, (counts.get(e.stamp_card_id) ?? 0) + 1);
  });

  // Pick the card the customer is closest to completing (smallest gap, but >0
  // stamps so we don't suggest a card they've never visited).
  let best: { card: StampCard; stamps: number } | null = null;
  for (const card of list) {
    const stamps = counts.get(card.id) ?? 0;
    if (stamps === 0) continue;
    const gap = card.stamps_required - stamps;
    if (gap <= 0) continue;
    if (!best || gap < best.card.stamps_required - best.stamps) {
      best = { card, stamps };
    }
  }
  if (!best) return null;

  return {
    stamps: best.stamps,
    required: best.card.stamps_required,
    reward_text: best.card.reward_text,
  };
}

export async function getStampProgressForOrg(
  organizationId: string,
  customerSessionId: string,
): Promise<Array<{ card: StampCard; stamps: number }>> {
  const svc = createSupabaseServiceClient();
  const { data: cards } = await svc
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true);
  const list = (cards as StampCard[] | null) ?? [];
  if (list.length === 0) return [];

  const cardIds = list.map((c) => c.id);
  const { data: events } = await svc
    .from("stamp_events")
    .select("stamp_card_id")
    .in("stamp_card_id", cardIds)
    .eq("customer_session_id", customerSessionId);

  const counts = new Map<string, number>();
  ((events as { stamp_card_id: string }[]) ?? []).forEach((e) => {
    counts.set(e.stamp_card_id, (counts.get(e.stamp_card_id) ?? 0) + 1);
  });

  return list.map((card) => ({
    card,
    stamps: counts.get(card.id) ?? 0,
  }));
}
