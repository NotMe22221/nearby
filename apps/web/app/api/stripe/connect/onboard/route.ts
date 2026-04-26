import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { ensureOrgContext, isOwner } from "@/lib/auth/membership";
import { stripeClient, stripeConfigured } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * Creates an Express Connected Account for the org if one doesn't exist, then
 * returns a one-time onboarding link the merchant can open.
 *
 * GET so it can be used as `<a href="/api/stripe/connect/onboard">…</a>`.
 */
export async function GET(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 503 },
    );
  }

  const auth = createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const ctx = await ensureOrgContext();
  if (!ctx) return NextResponse.json({ error: "No org" }, { status: 400 });
  if (!isOwner(ctx.role)) {
    return NextResponse.json(
      { error: "Only the organization owner can connect Stripe." },
      { status: 403 },
    );
  }

  const stripe = stripeClient();
  const svc = createSupabaseServiceClient();

  let stripeAccountId = ctx.organization.stripe_account_id;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: ctx.organization.name,
      },
      email: user.email ?? undefined,
    });
    stripeAccountId = account.id;
    await svc
      .from("organizations")
      .update({ stripe_account_id: stripeAccountId })
      .eq("id", ctx.organization.id);
  }

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}/api/stripe/connect/refresh`,
    return_url: `${origin}/merchant/payments?onboarded=1`,
    type: "account_onboarding",
  });

  return NextResponse.redirect(link.url, { status: 303 });
}
