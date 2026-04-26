import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CountdownChip } from "@/components/CountdownChip";
import { OfferActions } from "./OfferActions";
import type { Offer } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({
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
    .select("name, address")
    .eq("id", o.location_id)
    .maybeSingle();

  const remaining = Math.max(0, o.max_redemptions - o.redemptions_count);
  const w = o.context_snapshot?.weather;

  return (
    <main className="app-shell">
      <Link href="/" className="text-sm text-ink-900/60 hover:underline">
        &larr; back to offers
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-accent-600">
            {merchant?.name ?? "Local merchant"}
          </div>
          <CountdownChip expiresAt={o.expires_at} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-snug">
          {o.headline}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-900/80">
          {o.generated_text}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-900/70">
          <span className="rounded-full bg-accent-50 px-2.5 py-1 font-medium text-accent-700">
            {o.discount_pct}% off
          </span>
          <span className="rounded-full bg-ink-900/5 px-2.5 py-1">
            {remaining} of {o.max_redemptions} left
          </span>
          {w && (
            <span className="rounded-full bg-ink-900/5 px-2.5 py-1">
              {w.temp_c}°C · {w.description}
            </span>
          )}
        </div>

        <div className="mt-5 rounded-xl bg-ink-50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-900/70">
            On the offer
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {o.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span>{item.name}</span>
                <span className="text-ink-900/60">
                  base ${item.base_price.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {merchant?.address && (
          <p className="mt-4 text-xs text-ink-900/60">
            Pick up at {merchant.address}
          </p>
        )}
        <p className="mt-1 text-xs italic text-ink-900/60">
          {o.scarcity_text}
        </p>
      </div>

      <OfferActions offerId={o.id} expiresAt={o.expires_at} />
    </main>
  );
}
