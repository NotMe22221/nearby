"use client";

import { formatDistance } from "@/lib/geo/distance";
import type { NearbyMerchantListItem } from "@/app/api/offers/nearby/route";

export function NearbyMerchantCard({ merchant }: { merchant: NearbyMerchantListItem }) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(merchant.address || merchant.name)}`;

  return (
    <a
      href={mapsHref}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex gap-4 p-4 transition-transform active:scale-[0.99] ring-1 ring-ink-200/80"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100">
        {merchant.cover_image_url ? (
          <img
            src={merchant.cover_image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl" aria-hidden>
            🏪
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-accent-600">
          On Nearby
        </div>
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-ink-900">
          {merchant.name}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-900/70">
          {merchant.address}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-900/60">
          <span className="rounded-full bg-ink-900/5 px-2 py-0.5">
            {formatDistance(merchant.distance_km)} away
          </span>
          {!merchant.in_slow_window && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200/80">
              No live offer right now{/* offers only run during slow hours + rules */}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
