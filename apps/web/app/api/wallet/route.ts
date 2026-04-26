import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  LoyaltyRedemption,
  Offer,
  Organization,
  StampCard,
  StampEvent,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export type WalletOrgSummary = {
  organization: Pick<Organization, "id" | "name">;
  points: number;
  stamps: Array<{
    card: StampCard;
    stamps: number;
    completed_rewards: number;
  }>;
};

export type WalletGrantedOffer = {
  offer: Pick<
    Offer,
    "id" | "headline" | "discount_pct" | "expires_at" | "redemptions_count" | "max_redemptions"
  >;
  granted_at: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "session required" }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();

  const [
    { data: ledger },
    { data: stampEvents },
    { data: redemptions },
  ] = await Promise.all([
    svc
      .from("point_ledger")
      .select("organization_id, delta")
      .eq("customer_session_id", sessionId),
    svc
      .from("stamp_events")
      .select("id, stamp_card_id, customer_session_id, created_at, source, redemption_id, payment_id")
      .eq("customer_session_id", sessionId),
    svc
      .from("loyalty_redemptions")
      .select("*")
      .eq("customer_session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);

  // Aggregate points by org.
  const pointsByOrg = new Map<string, number>();
  ((ledger as { organization_id: string; delta: number }[]) ?? []).forEach(
    (row) => {
      pointsByOrg.set(
        row.organization_id,
        (pointsByOrg.get(row.organization_id) ?? 0) + row.delta,
      );
    },
  );

  // Pull all stamp cards relevant to this customer.
  const cardIds = Array.from(
    new Set(((stampEvents as StampEvent[]) ?? []).map((e) => e.stamp_card_id)),
  );
  const { data: cards } = cardIds.length
    ? await svc.from("stamp_cards").select("*").in("id", cardIds)
    : { data: [] as StampCard[] };
  const cardList = (cards as StampCard[]) ?? [];

  // Pull every org we touched (via points or stamps).
  const orgIds = new Set<string>();
  pointsByOrg.forEach((_, k) => orgIds.add(k));
  cardList.forEach((c) => orgIds.add(c.organization_id));

  const { data: orgs } = orgIds.size
    ? await svc
        .from("organizations")
        .select("id, name")
        .in("id", Array.from(orgIds))
    : { data: [] as { id: string; name: string }[] };

  // Tally stamps per card.
  const stampsByCard = new Map<string, number>();
  ((stampEvents as StampEvent[]) ?? []).forEach((e) => {
    stampsByCard.set(e.stamp_card_id, (stampsByCard.get(e.stamp_card_id) ?? 0) + 1);
  });

  // Tally completed stamp_reward redemptions per card.
  const completedByCard = new Map<string, number>();
  ((redemptions as LoyaltyRedemption[]) ?? []).forEach((r) => {
    if (r.kind === "stamp_reward" && r.stamp_card_id) {
      completedByCard.set(
        r.stamp_card_id,
        (completedByCard.get(r.stamp_card_id) ?? 0) + 1,
      );
    }
  });

  // Build per-org summaries.
  const orgMap = new Map<string, WalletOrgSummary>();
  ((orgs as { id: string; name: string }[]) ?? []).forEach((o) => {
    orgMap.set(o.id, {
      organization: { id: o.id, name: o.name },
      points: pointsByOrg.get(o.id) ?? 0,
      stamps: [],
    });
  });
  for (const card of cardList) {
    const summary = orgMap.get(card.organization_id);
    if (!summary) continue;
    summary.stamps.push({
      card,
      stamps: stampsByCard.get(card.id) ?? 0,
      completed_rewards: completedByCard.get(card.id) ?? 0,
    });
  }

  // Granted offers (still active).
  const grantedOfferIds = ((redemptions as LoyaltyRedemption[]) ?? [])
    .filter((r) => r.granted_offer_id)
    .map((r) => r.granted_offer_id as string);

  const { data: grantedOffers } = grantedOfferIds.length
    ? await svc
        .from("offers")
        .select(
          "id, headline, discount_pct, expires_at, redemptions_count, max_redemptions",
        )
        .in("id", grantedOfferIds)
    : { data: [] as Offer[] };

  const grantedById = new Map<string, Offer>();
  ((grantedOffers as Offer[]) ?? []).forEach((o) => grantedById.set(o.id, o));

  const granted: WalletGrantedOffer[] = ((redemptions as LoyaltyRedemption[]) ?? [])
    .filter((r) => r.granted_offer_id && grantedById.has(r.granted_offer_id))
    .map((r) => ({
      offer: grantedById.get(r.granted_offer_id as string)!,
      granted_at: r.created_at,
    }));

  return NextResponse.json({
    orgs: Array.from(orgMap.values()),
    granted,
  });
}
