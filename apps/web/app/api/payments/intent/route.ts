import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  platformFeePct,
  stripeClient,
  stripeConfigured,
  stripePublishableKey,
} from "@/lib/stripe/server";
import type { Offer, OfferItemSnapshot } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type Body = { offerId?: string; sessionId?: string };

function discountedTotalCents(items: OfferItemSnapshot[], discountPct: number): number {
  const baseDollars = items.reduce((sum, i) => sum + Number(i.base_price), 0);
  const baseCents = Math.round(baseDollars * 100);
  const discountedCents = Math.round(baseCents * (100 - discountPct) / 100);
  return Math.max(50, discountedCents); // Stripe minimum $0.50
}

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server." },
      { status: 503 },
    );
  }

  const { offerId, sessionId } = (await req.json().catch(() => ({}))) as Body;
  if (!offerId || !sessionId) {
    return NextResponse.json(
      { error: "offerId and sessionId are required." },
      { status: 400 },
    );
  }

  const svc = createSupabaseServiceClient();
  const { data: offerRow, error: offerErr } = await svc
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (offerErr || !offerRow) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }
  const offer = offerRow as Offer;

  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Offer has expired" }, { status: 410 });
  }
  if (offer.redemptions_count >= offer.max_redemptions) {
    return NextResponse.json({ error: "Offer is full" }, { status: 409 });
  }

  const { data: location } = await svc
    .from("locations")
    .select("organization_id")
    .eq("id", offer.location_id)
    .maybeSingle();
  if (!location?.organization_id) {
    return NextResponse.json({ error: "Location missing org" }, { status: 500 });
  }

  const { data: org } = await svc
    .from("organizations")
    .select("stripe_account_id, stripe_charges_enabled")
    .eq("id", location.organization_id)
    .maybeSingle();
  if (!org?.stripe_account_id || !org.stripe_charges_enabled) {
    return NextResponse.json(
      { error: "This merchant doesn't accept card payments yet." },
      { status: 400 },
    );
  }

  const amount = discountedTotalCents(offer.items, offer.discount_pct);
  const feeAmount = Math.round((amount * platformFeePct()) / 100);

  const stripe = stripeClient();
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    application_fee_amount: feeAmount,
    transfer_data: { destination: org.stripe_account_id },
    metadata: {
      offer_id: offer.id,
      organization_id: location.organization_id,
      customer_session_id: sessionId,
    },
  });

  return NextResponse.json({
    client_secret: intent.client_secret,
    publishable_key: stripePublishableKey(),
    stripe_account: org.stripe_account_id,
    amount,
    currency: "usd",
  });
}
