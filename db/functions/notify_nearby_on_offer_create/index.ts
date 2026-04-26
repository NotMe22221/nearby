// Supabase Edge Function — fan out a push notification when a new offer is
// inserted within N km of any registered device.
//
// Hook this up via a Database Webhook on `public.offers` insert events that
// POSTs to this function. It reads the offer + its location, then sends an
// Expo push notification to all devices within `RADIUS_KM` (default 5).
//
// Run locally:
//   supabase functions serve notify_nearby_on_offer_create
// Deploy:
//   supabase functions deploy notify_nearby_on_offer_create

// @ts-expect-error Deno provides the runtime.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error Deno-only ESM import.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RADIUS_KM = Number(Deno.env.get("RADIUS_KM") ?? "5");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

type DBWebhookEvent = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    location_id: string;
    headline: string;
    discount_pct: number;
  };
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const body = (await req.json()) as DBWebhookEvent;
  if (body.type !== "INSERT" || body.table !== "offers") {
    return new Response("ignored", { status: 200 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: loc } = await sb
    .from("locations")
    .select("lat, lng, name")
    .eq("id", body.record.location_id)
    .maybeSingle();
  if (!loc?.lat || !loc?.lng) return new Response("no loc", { status: 200 });

  const { data: devices } = await sb
    .from("devices")
    .select("expo_push_token, last_lat, last_lng");
  const list = (devices ?? []) as Array<{
    expo_push_token: string;
    last_lat: number | null;
    last_lng: number | null;
  }>;

  const targets = list.filter((d) => {
    if (d.last_lat == null || d.last_lng == null) return false;
    return haversineKm(loc.lat, loc.lng, d.last_lat, d.last_lng) <= RADIUS_KM;
  });
  if (targets.length === 0) return new Response("no nearby", { status: 200 });

  const messages = targets.map((d) => ({
    to: d.expo_push_token,
    sound: "default",
    title: `${loc.name} · ${body.record.discount_pct}% off`,
    body: body.record.headline,
    data: { offer_id: body.record.id },
  }));

  const r = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  return new Response(await r.text(), { status: r.status });
});
