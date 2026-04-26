import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { isCodeShape } from "@/lib/offers/code";
import { getActiveOrgContext } from "@/lib/auth/membership";
import { recordLoyaltyForRedemption } from "@/lib/loyalty/record";
import { pushSquareRedemption } from "@/lib/square/redemption";

export const dynamic = "force-dynamic";

type Body = {
  code?: string;
  payload?: string;
  method?: "code" | "qr";
};

function parsePayload(input: string): { code: string; session: string | null } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as { code?: string; session?: string };
      if (obj && typeof obj.code === "string" && isCodeShape(obj.code)) {
        return {
          code: obj.code.toUpperCase(),
          session: typeof obj.session === "string" ? obj.session : null,
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  if (isCodeShape(trimmed)) {
    return { code: trimmed.toUpperCase(), session: null };
  }
  return null;
}

export async function POST(req: Request) {
  const auth = createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const ctx = await getActiveOrgContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "No organization for this account." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const raw = body.code || body.payload || "";
  const parsed = parsePayload(raw);
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not read a valid offer code." },
      { status: 400 },
    );
  }

  const method: "code" | "qr" =
    body.method === "qr" ? "qr" : body.payload && !body.code ? "qr" : "code";

  const svc = createSupabaseServiceClient();

  const { data: offer, error: offerErr } = await svc
    .from("offers")
    .select("*")
    .eq("redemption_code", parsed.code)
    .maybeSingle();
  if (offerErr || !offer) {
    return NextResponse.json({ error: "Code not found." }, { status: 404 });
  }

  // The offer's location must belong to one of the merchant's org locations.
  const ownsLocation = ctx.locations.some((l) => l.id === offer.location_id);
  if (!ownsLocation) {
    return NextResponse.json(
      { error: "This code is for a different merchant." },
      { status: 403 },
    );
  }
  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Offer has expired." }, { status: 410 });
  }
  if (offer.redemptions_count >= offer.max_redemptions) {
    return NextResponse.json(
      { error: "All redemptions have been used." },
      { status: 409 },
    );
  }

  const sessionId =
    parsed.session ||
    `manual:${user.id}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (parsed.session) {
    const { data: existing } = await svc
      .from("redemptions")
      .select("id")
      .eq("offer_id", offer.id)
      .eq("customer_session_id", parsed.session)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        already: true,
        offer_id: offer.id,
        discount_pct: offer.discount_pct,
      });
    }
  }

  const { data: redemption, error: insErr } = await svc
    .from("redemptions")
    .insert({
      offer_id: offer.id,
      customer_session_id: sessionId,
      method,
    })
    .select("*")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const { error: updErr } = await svc
    .from("offers")
    .update({ redemptions_count: offer.redemptions_count + 1 })
    .eq("id", offer.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Phase 2: stamps + points.
  await recordLoyaltyForRedemption({
    organization_id: ctx.organization.id,
    customer_session_id: sessionId,
    redemption_id: redemption.id,
    payment_id: null,
    discount_pct: offer.discount_pct,
  }).catch((e) => console.warn("loyalty record failed", e));

  // Phase 4: push to Square POS, best effort.
  pushSquareRedemption({
    organization_id: ctx.organization.id,
    redemption_id: redemption.id,
    offer_id: offer.id,
    discount_pct: offer.discount_pct,
    customer_session_id: sessionId,
  }).catch((e) => console.warn("square push failed", e));

  return NextResponse.json({
    ok: true,
    offer_id: offer.id,
    discount_pct: offer.discount_pct,
    redemptions_count: offer.redemptions_count + 1,
    max_redemptions: offer.max_redemptions,
  });
}
