import Stripe from "stripe";
import { readEnv, requireEnv } from "@/lib/supabase/env";

let _stripe: Stripe | null = null;

export function stripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = requireEnv("STRIPE_SECRET_KEY");
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

export function stripePublishableKey(): string | null {
  return readEnv("STRIPE_PUBLISHABLE_KEY") ?? null;
}

export function stripeWebhookSecret(): string | null {
  return readEnv("STRIPE_WEBHOOK_SECRET") ?? null;
}

export function stripeConfigured(): boolean {
  return !!readEnv("STRIPE_SECRET_KEY") && !!readEnv("STRIPE_PUBLISHABLE_KEY");
}

/** Platform fee % charged on every payment (defaults to 5%). */
export function platformFeePct(): number {
  const v = Number(readEnv("STRIPE_PLATFORM_FEE_PCT") ?? "5");
  if (!Number.isFinite(v) || v < 0) return 5;
  return Math.min(v, 30);
}
