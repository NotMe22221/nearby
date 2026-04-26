import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/supabase/types";
import { RedeemView } from "./RedeemView";

export const dynamic = "force-dynamic";

export default async function RedeemPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!offer) notFound();

  const { data: merchant } = await supabase
    .from("locations")
    .select("name, address, organization_id")
    .eq("id", (offer as Offer).location_id)
    .maybeSingle();

  let stripeEnabled = false;
  if (merchant?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_account_id, stripe_charges_enabled")
      .eq("id", merchant.organization_id)
      .maybeSingle();
    stripeEnabled = !!org?.stripe_account_id && !!org?.stripe_charges_enabled;
  }

  return (
    <main className="app-shell">
      <Link
        href={`/offer/${params.id}`}
        className="text-sm text-ink-900/60 hover:underline"
      >
        &larr; back to offer
      </Link>
      <RedeemView
        offer={offer as Offer}
        merchantName={merchant?.name ?? ""}
        merchantAddress={merchant?.address ?? ""}
        stripeEnabled={stripeEnabled}
      />
    </main>
  );
}
