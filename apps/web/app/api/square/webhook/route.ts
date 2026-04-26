import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  squareApiBaseUrl,
  squareWebhookSignatureKey,
} from "@/lib/square/client";
import { recordLoyaltyForRedemption } from "@/lib/loyalty/record";
import type { SquareConnection, SquareItemLink } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type SquareEvent = {
  merchant_id?: string;
  type?: string;
  data?: {
    id?: string;
    object?: {
      payment?: {
        id?: string;
        order_id?: string;
        location_id?: string;
        amount_money?: { amount?: number; currency?: string };
      };
      refund?: {
        id?: string;
        payment_id?: string;
        location_id?: string;
        amount_money?: { amount?: number; currency?: string };
      };
    };
  };
};

function verifySignature(
  rawBody: string,
  signature: string | null,
  signatureKey: string,
  notificationUrl: string,
): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const signatureKey = squareWebhookSignatureKey();
  if (!signatureKey) {
    return NextResponse.json(
      { error: "Square webhook signature key not configured" },
      { status: 503 },
    );
  }
  const raw = await req.text();
  const sig = req.headers.get("x-square-hmacsha256-signature");
  // Square computes HMAC over notification_url + raw_body, where
  // notification_url is the URL configured in the dashboard. We reconstruct
  // it from the request URL.
  const url = new URL(req.url);
  const notificationUrl = `${url.protocol}//${url.host}${url.pathname}`;
  if (!verifySignature(raw, sig, signatureKey, notificationUrl)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: SquareEvent;
  try {
    event = JSON.parse(raw) as SquareEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  switch (event.type) {
    case "payment.created":
      await handlePaymentCreated(event);
      break;
    case "refund.created":
      // We currently just acknowledge; pos_redemptions tracks our outbound
      // refunds and we don't need to mutate state on this side.
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentCreated(event: SquareEvent) {
  const payment = event.data?.object?.payment;
  const merchantId = event.merchant_id;
  if (!payment?.id || !payment.order_id || !merchantId) return;

  const svc = createSupabaseServiceClient();

  const { data: conn } = await svc
    .from("square_connections")
    .select("*")
    .eq("square_merchant_id", merchantId)
    .maybeSingle();
  const connection = conn as SquareConnection | null;
  if (!connection) return;

  // Pull the order so we can see which catalog items were purchased.
  const orderRes = await fetch(
    `${squareApiBaseUrl()}/v2/orders/${payment.order_id}`,
    {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Square-Version": "2024-09-19",
      },
    },
  );
  if (!orderRes.ok) return;
  const orderJson = (await orderRes.json()) as {
    order?: {
      line_items?: Array<{
        catalog_object_id?: string;
        quantity?: string;
      }>;
    };
  };
  const lineItems = orderJson.order?.line_items ?? [];
  const catalogIds = Array.from(
    new Set(
      lineItems
        .map((li) => li.catalog_object_id)
        .filter((x): x is string => !!x),
    ),
  );
  if (catalogIds.length === 0) return;

  // Find linked City Wallet items.
  const { data: links } = await svc
    .from("square_item_links")
    .select("*")
    .in("square_catalog_object_id", catalogIds);
  const linkRows = (links as SquareItemLink[]) ?? [];
  if (linkRows.length === 0) return;

  // Use the Square payment id as a stand-in customer session id (we don't
  // have a real one for in-store walk-ins). This still credits stamps to a
  // distinct identity per visit.
  const customerSessionId = `square:${payment.id}`;

  // Each linked item line grants 1 stamp on every active stamp card.
  await recordLoyaltyForRedemption({
    organization_id: connection.organization_id,
    customer_session_id: customerSessionId,
    redemption_id: null,
    payment_id: null,
    discount_pct: 0,
  }).catch((err) => console.warn("loyalty record from square failed", err));
}
