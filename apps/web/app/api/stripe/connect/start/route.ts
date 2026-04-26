import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { stripeClient, stripeConfigured } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * Mobile-friendly Stripe Connect onboarding. Accepts org_id as a query param
 * so mobile apps can open this URL in a browser without cookie-based auth.
 */
export async function GET(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const orgId = url.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "Missing org_id" }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, stripe_account_id")
    .eq("id", orgId)
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const stripe = stripeClient();

  let stripeAccountId = org.stripe_account_id;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: org.name,
      },
    });
    stripeAccountId = account.id;
    await svc
      .from("organizations")
      .update({ stripe_account_id: stripeAccountId })
      .eq("id", org.id);
  }

  const origin = `${url.protocol}//${url.host}`;
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}/api/stripe/connect/refresh`,
    return_url: `${origin}/merchant/payments?onboarded=1`,
    type: "account_onboarding",
  });

  return NextResponse.redirect(link.url, { status: 303 });
}
