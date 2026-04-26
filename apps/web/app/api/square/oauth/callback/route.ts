import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  squareApiBaseUrl,
  squareApplicationId,
  squareApplicationSecret,
  squareConfigured,
} from "@/lib/square/client";

export const dynamic = "force-dynamic";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  merchant_id: string;
  token_type: string;
};

export async function GET(req: Request) {
  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "Square not configured" },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorQ = url.searchParams.get("error");
  if (errorQ) {
    return NextResponse.redirect(
      `${url.origin}/merchant/pos?error=${encodeURIComponent(errorQ)}`,
      { status: 303 },
    );
  }
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
  }

  let parsed: { org?: string; u?: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.json({ error: "Bad state" }, { status: 400 });
  }
  const orgId = parsed.org;
  if (!orgId) {
    return NextResponse.json({ error: "Bad state (no org)" }, { status: 400 });
  }

  // Exchange the authorization code for tokens.
  const tokenRes = await fetch(`${squareApiBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: squareApplicationId(),
      client_secret: squareApplicationSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.redirect(
      `${url.origin}/merchant/pos?error=${encodeURIComponent(`token_exchange_failed: ${text.slice(0, 80)}`)}`,
      { status: 303 },
    );
  }
  const tokens = (await tokenRes.json()) as TokenResponse;

  const svc = createSupabaseServiceClient();

  // Try to grab the first location to make sync simpler later.
  let squareLocationId: string | null = null;
  try {
    const locRes = await fetch(`${squareApiBaseUrl()}/v2/locations`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Square-Version": "2024-09-19",
      },
    });
    if (locRes.ok) {
      const locJson = (await locRes.json()) as {
        locations?: Array<{ id?: string; status?: string }>;
      };
      const active = locJson.locations?.find((l) => l.status === "ACTIVE");
      squareLocationId = active?.id ?? locJson.locations?.[0]?.id ?? null;
    }
  } catch {
    // Non-fatal.
  }

  await svc.from("square_connections").upsert(
    {
      organization_id: orgId,
      square_merchant_id: tokens.merchant_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      square_location_id: squareLocationId,
    },
    { onConflict: "organization_id" },
  );

  return NextResponse.redirect(`${url.origin}/merchant/pos?connected=1`, {
    status: 303,
  });
}
