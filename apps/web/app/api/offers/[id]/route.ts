import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const { data: offer, error } = await supabase
    .from("offers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!offer)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: location } = await supabase
    .from("locations")
    .select("name, address, organization_id")
    .eq("id", offer.location_id)
    .maybeSingle();

  let stripeEnabled = false;
  if (location?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_account_id, stripe_charges_enabled")
      .eq("id", location.organization_id)
      .maybeSingle();
    stripeEnabled = !!org?.stripe_account_id && !!org?.stripe_charges_enabled;
  }

  return NextResponse.json({
    offer: {
      ...offer,
      merchant_name: location?.name ?? "",
      merchant_address: location?.address ?? "",
      organization_id: location?.organization_id ?? null,
      stripe_enabled: stripeEnabled,
    },
  });
}
