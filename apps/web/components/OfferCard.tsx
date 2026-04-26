"use client";

import Link from "next/link";
import { CountdownChip } from "./CountdownChip";
import { formatDistance } from "@/lib/geo/distance";
import type { NearbyOffer } from "@/app/api/offers/nearby/route";

export function OfferCard({ offer }: { offer: NearbyOffer }) {
  const remaining = Math.max(
    0,
    offer.max_redemptions - offer.redemptions_count,
  );
  const w = offer.context_snapshot?.weather;

  return (
    <Link
      href={`/offer/${offer.id}`}
      className="card block p-5 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-accent-600">
          {offer.merchant_name}
        </div>
        <CountdownChip expiresAt={offer.expires_at} />
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-snug">
        {offer.headline}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-900/80">
        {offer.generated_text}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-900/70">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 font-medium text-accent-700">
          {offer.discount_pct}% off
        </span>
        <span className="rounded-full bg-ink-900/5 px-2.5 py-1">
          {formatDistance(offer.distance_km)} away
        </span>
        <span className="rounded-full bg-ink-900/5 px-2.5 py-1">
          {remaining} of {offer.max_redemptions} left
        </span>
        {w && (
          <span className="rounded-full bg-ink-900/5 px-2.5 py-1">
            {w.temp_c}°C · {w.description}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs italic text-ink-900/60">
        {offer.scarcity_text}
      </p>
    </Link>
  );
}
