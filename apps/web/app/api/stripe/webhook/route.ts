import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  stripeClient,
  stripeConfigured,
  stripeWebhookSecret,
} from "@/lib/stripe/server";
import { recordLoyaltyForRedemption } from "@/lib/loyalty/record";
import { pushSquareRedemption } from "@/lib/square/redemption";
import type { Stripe } from "stripe";

export const dynamic = "force-dynamic";

// Stripe webhook needs the raw body for signature verification.
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  const secret = stripeWebhookSecret();
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Missing webhook signature or secret" },
      { status: 400 },
    );
  }
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : err}` },
      { status: 400 },
    );
  }

  const svc = createSupabaseServiceClient();

  switch (event.type) {
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      await svc
        .from("organizations")
        .update({
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: !!acct.payouts_enabled,
          stripe_details_submitted: !!acct.details_submitted,
        })
        .eq("stripe_account_id", acct.id);
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSucceeded(pi);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      if (charge.payment_intent) {
        await svc
          .from("payments")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", charge.payment_intent as string);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const svc = createSupabaseServiceClient();
  const offerId = pi.metadata?.offer_id;
  const orgId = pi.metadata?.organization_id;
  const sessionId = pi.metadata?.customer_session_id;
  if (!offerId || !orgId || !sessionId) return;

  // Idempotency on the payments table.
  const { data: existingPayment } = await svc
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();
  if (existingPayment) return;

  const { data: payment, error: payErr } = await svc
    .from("payments")
    .insert({
      offer_id: offerId,
      organization_id: orgId,
      customer_session_id: sessionId,
      stripe_payment_intent_id: pi.id,
      amount: pi.amount_received ?? pi.amount,
      currency: pi.currency,
      status: pi.status,
    })
    .select("*")
    .single();
  if (payErr) {
    console.error("payments insert error", payErr);
    return;
  }

  // Auto-redeem the offer if the customer hasn't already.
  const { data: offer } = await svc
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return;

  const { data: existingRedemption } = await svc
    .from("redemptions")
    .select("id")
    .eq("offer_id", offerId)
    .eq("customer_session_id", sessionId)
    .maybeSingle();

  let redemptionId: string | null = existingRedemption?.id ?? null;
  if (!existingRedemption) {
    if (offer.redemptions_count < offer.max_redemptions) {
      const { data: redemption } = await svc
        .from("redemptions")
        .insert({
          offer_id: offerId,
          customer_session_id: sessionId,
          method: "stripe",
        })
        .select("*")
        .single();
      redemptionId = redemption?.id ?? null;
      await svc
        .from("offers")
        .update({ redemptions_count: offer.redemptions_count + 1 })
        .eq("id", offerId);
    }
  }

  // Stamps + points + Square (best effort).
  await recordLoyaltyForRedemption({
    organization_id: orgId,
    customer_session_id: sessionId,
    redemption_id: redemptionId,
    payment_id: payment.id,
    discount_pct: offer.discount_pct,
  }).catch((e) => console.warn("loyalty record from stripe failed", e));

  if (redemptionId) {
    pushSquareRedemption({
      organization_id: orgId,
      redemption_id: redemptionId,
      offer_id: offerId,
      discount_pct: offer.discount_pct,
      customer_session_id: sessionId,
    }).catch((e) => console.warn("square push from stripe failed", e));
  }
}
