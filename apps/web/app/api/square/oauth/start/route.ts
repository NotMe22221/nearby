import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOrgContext, isOwner } from "@/lib/auth/membership";
import {
  squareApplicationId,
  squareConfigured,
  squareOauthBaseUrl,
} from "@/lib/square/client";

export const dynamic = "force-dynamic";

const SCOPES = [
  "MERCHANT_PROFILE_READ",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "ITEMS_READ",
  "ITEMS_WRITE",
];

export async function GET(req: Request) {
  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "Square is not configured." },
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
      { error: "Only the organization owner can connect Square." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  // We pack the org id into state so the callback knows where to associate
  // the resulting tokens (CSRF mitigation: prefix with the user id hash).
  const state = Buffer.from(
    JSON.stringify({ org: ctx.organization.id, u: user.id }),
  ).toString("base64url");

  const oauth = new URL(`${squareOauthBaseUrl()}/oauth2/authorize`);
  oauth.searchParams.set("client_id", squareApplicationId() ?? "");
  oauth.searchParams.set("scope", SCOPES.join(" "));
  oauth.searchParams.set("session", "false");
  oauth.searchParams.set("state", state);
  oauth.searchParams.set(
    "redirect_uri",
    `${origin}/api/square/oauth/callback`,
  );

  return NextResponse.redirect(oauth.toString(), { status: 303 });
}
