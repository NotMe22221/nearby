import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { applySquareDiscountForRedemption } from "@/lib/square/client";

/**
 * After a successful redemption, push a corresponding refund/discount to the
 * org's connected Square account (if any). Records the result in pos_redemptions.
 *
 * Best-effort — failures don't block the redemption; the merchant just sees an
 * "Apply at register" hint instead.
 */
export async function pushSquareRedemption(opts: {
  organization_id: string;
  redemption_id: string;
  offer_id: string;
  discount_pct: number;
  customer_session_id: string;
}) {
  const svc = createSupabaseServiceClient();

  const { data: conn } = await svc
    .from("square_connections")
    .select("*")
    .eq("organization_id", opts.organization_id)
    .maybeSingle();
  if (!conn) return; // org isn't connected to Square; nothing to do.

  const result = await applySquareDiscountForRedemption({
    accessToken: conn.access_token as string,
    squareLocationId: conn.square_location_id as string | null,
    offerId: opts.offer_id,
    discountPct: opts.discount_pct,
    customerSessionId: opts.customer_session_id,
  });

  await svc.from("pos_redemptions").insert({
    redemption_id: opts.redemption_id,
    square_payment_id: result.payment_id ?? null,
    square_refund_id: result.refund_id ?? null,
    status: result.status,
    error: result.error ?? null,
  });
}
