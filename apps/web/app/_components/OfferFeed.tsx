"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OfferCard } from "@/components/OfferCard";
import { NearbyMerchantCard } from "@/components/NearbyMerchantCard";
import type {
  NearbyMerchantListItem,
  NearbyOffer,
} from "@/app/api/offers/nearby/route";
import {
  type PlaceCategoryId,
  PLACE_CATEGORY_CHIPS,
  merchantMatchesSearch,
  offerMatchesSearch,
} from "@/lib/placeSearchFilter";

type GeoState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "ready"; lat: number; lng: number }
  | { kind: "denied"; message: string };

export function OfferFeed() {
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });
  const [offers, setOffers] = useState<NearbyOffer[] | null>(null);
  const [merchants, setMerchants] = useState<NearbyMerchantListItem[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategoryId>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filteredOffers = useMemo(() => {
    if (!offers?.length) return [];
    return offers.filter((o) =>
      offerMatchesSearch(
        {
          headline: o.headline,
          generated_text: o.generated_text,
          merchant_name: o.merchant_name,
          merchant_address: o.merchant_address,
        },
        debouncedQuery,
        selectedCategory,
      ),
    );
  }, [offers, debouncedQuery, selectedCategory]);

  const filteredMerchants = useMemo(() => {
    if (!merchants?.length) return [];
    return merchants.filter((m) =>
      merchantMatchesSearch(
        { name: m.name, address: m.address },
        debouncedQuery,
        selectedCategory,
      ),
    );
  }, [merchants, debouncedQuery, selectedCategory]);

  const hasRaw =
    (offers?.length ?? 0) > 0 || (merchants?.length ?? 0) > 0;
  const hasFiltered =
    filteredOffers.length > 0 || filteredMerchants.length > 0;

  const requestGeo = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeo({
        kind: "denied",
        message: "This browser doesn't support geolocation.",
      });
      return;
    }
    setGeo({ kind: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          kind: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) =>
        setGeo({
          kind: "denied",
          message: err.message || "Location permission denied.",
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const loadOffers = useCallback(async () => {
    if (geo.kind !== "ready") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/offers/nearby?lat=${geo.lat}&lng=${geo.lng}&radius_km=12`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load offers.");
      setOffers(json.offers as NearbyOffer[]);
      setMerchants(
        (json.merchants ?? []) as NearbyMerchantListItem[],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMerchants(null);
    } finally {
      setLoading(false);
    }
  }, [geo]);

  useEffect(() => {
    requestGeo();
  }, [requestGeo]);

  useEffect(() => {
    if (geo.kind === "ready") loadOffers();
  }, [geo, loadOffers]);

  if (geo.kind === "idle" || geo.kind === "requesting") {
    return (
      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-ink-900/70">
          Asking your browser for your location to find nearby offers…
        </p>
        <button type="button" onClick={requestGeo} className="btn-secondary">
          Try again
        </button>
      </div>
    );
  }

  if (geo.kind === "denied") {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-ink-900/80">{geo.message}</p>
        <p className="mt-2 text-xs text-ink-900/60">
          Nearby only shows real, location-based offers, so we need your
          location.
        </p>
        <button type="button" onClick={requestGeo} className="btn-primary mt-4">
          Enable location
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-ink-900/60">
        <span>
          Pinned at {geo.lat.toFixed(3)}, {geo.lng.toFixed(3)}
        </span>
        <button
          type="button"
          onClick={loadOffers}
          className="rounded-full bg-white px-3 py-1 ring-1 ring-ink-200 hover:bg-ink-100"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-900/40">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search offers, businesses, or addresses"
          className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-10 pr-10 text-sm text-ink-900 placeholder:text-ink-900/40 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-900/50 hover:bg-ink-100"
            onClick={() => {
              setSearchQuery("");
              setDebouncedQuery("");
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {PLACE_CATEGORY_CHIPS.map((chip) => {
          const active = selectedCategory === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setSelectedCategory(chip.id)}
              className={
                active
                  ? "shrink-0 rounded-full bg-accent-600 px-4 py-1.5 text-xs font-semibold text-white"
                  : "shrink-0 rounded-full border border-ink-200 bg-white px-4 py-1.5 text-xs font-semibold text-ink-900/80 ring-1 ring-ink-100 hover:bg-ink-50"
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {selectedCategory !== "all" && (
        <p className="text-xs text-ink-900/55">
          Categories help surface food &amp; retail keywords in offer text and
          business names.
        </p>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {loading && offers === null && (
        <div className="card animate-pulse p-6">
          <div className="h-3 w-1/3 rounded bg-ink-200" />
          <div className="mt-3 h-5 w-3/4 rounded bg-ink-200" />
          <div className="mt-2 h-3 w-full rounded bg-ink-100" />
          <div className="mt-1 h-3 w-2/3 rounded bg-ink-100" />
        </div>
      )}

      {offers && merchants && hasRaw && !hasFiltered && !loading && (
        <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-6 text-center">
          <h2 className="text-base font-semibold text-ink-900">No matches</h2>
          <p className="mt-1 text-sm text-ink-900/70">
            Try clearing search, choosing All, or a different category.
          </p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => {
              setSearchQuery("");
              setDebouncedQuery("");
              setSelectedCategory("all");
            }}
          >
            Reset filters
          </button>
        </div>
      )}

      {offers && offers.length === 0 && merchants && merchants.length === 0 && !loading && (
        <div className="card p-6 text-center">
          <h2 className="text-base font-semibold">No businesses in range</h2>
          <p className="mt-1 text-sm text-ink-900/70">
            No registered businesses within about 12 km, or we couldn’t load
            them. Try again after merchants save an address, or use a
            different spot.
          </p>
        </div>
      )}

      {offers &&
        offers.length === 0 &&
        merchants &&
        merchants.length > 0 &&
        !loading &&
        hasFiltered && (
          <p className="text-center text-sm text-ink-900/60">
            No live offers in this area right now — timed offers run during each
            merchant’s slow hours when rules are set up.
          </p>
        )}

      {filteredOffers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink-900/80">Active offers</h2>
          {filteredOffers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}

      {filteredMerchants.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-900/80">On Nearby</h2>
          <p className="text-xs text-ink-900/60">
            Businesses on the app — same list as the mobile &quot;Nearby&quot;
            feed. Tap a card for Google Maps.
          </p>
          {filteredMerchants.map((m) => (
            <NearbyMerchantCard key={m.id} merchant={m} />
          ))}
        </div>
      )}
    </div>
  );
}
