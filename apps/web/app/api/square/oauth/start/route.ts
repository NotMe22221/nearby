import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
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

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const orgIdParam = url.searchParams.get("org_id");

  let orgId: string;
  let userId: string;

  if (orgIdParam) {
    // Mobile flow: org_id passed as query param, no cookie auth needed
    const svc = createSupabaseServiceClient();
    const { data: org, error: orgErr } = await svc
      .from("organizations")
      .select("id")
      .eq("id", orgIdParam)
      .single();
    if (orgErr || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    orgId = org.id;
    userId = "mobile";
  } else {
    // Web flow: cookie-based auth
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
    orgId = ctx.organization.id;
    userId = user.id;
  }

  const state = Buffer.from(
    JSON.stringify({ org: orgId, u: userId }),
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
