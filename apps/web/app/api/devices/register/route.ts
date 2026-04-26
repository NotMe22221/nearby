import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  sessionId?: string;
  expoPushToken?: string;
  lat?: number;
  lng?: number;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { sessionId, expoPushToken, lat, lng } = body;
  if (!sessionId || !expoPushToken) {
    return NextResponse.json(
      { error: "sessionId and expoPushToken required" },
      { status: 400 },
    );
  }

  const svc = createSupabaseServiceClient();
  await svc.from("devices").upsert(
    {
      customer_session_id: sessionId,
      expo_push_token: expoPushToken,
      last_lat: typeof lat === "number" ? lat : null,
      last_lng: typeof lng === "number" ? lng : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );

  return NextResponse.json({ ok: true });
}
