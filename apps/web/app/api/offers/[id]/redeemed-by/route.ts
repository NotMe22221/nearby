import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get("session") || "";
  if (!session) {
    return NextResponse.json({ redeemed: false });
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("redemptions")
    .select("id, redeemed_at, method")
    .eq("offer_id", params.id)
    .eq("customer_session_id", session)
    .limit(1)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    redeemed: Boolean(data),
    redemption: data ?? null,
  });
}
