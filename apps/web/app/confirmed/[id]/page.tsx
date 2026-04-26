import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
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
  const o = offer as Offer;

  const { data: merchant } = await supabase
    .from("locations")
    .select("name")
    .eq("id", o.location_id)
    .maybeSingle();

  return (
    <main className="app-shell">
      <div className="card mt-6 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Redeemed</h1>
        <p className="mt-1 text-sm text-ink-900/70">
          {o.discount_pct}% off applied at {merchant?.name ?? "the merchant"}.
        </p>
        <p className="mt-4 text-xs text-ink-900/60">
          Code <span className="font-mono">{o.redemption_code}</span>
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          See more offers
        </Link>
      </div>
    </main>
  );
}
