"use client";

import { useCallback, useEffect, useState } from "react";
import { OfferCard } from "@/components/OfferCard";
import type { NearbyOffer } from "@/app/api/offers/nearby/route";

type GeoState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "ready"; lat: number; lng: number }
  | { kind: "denied"; message: string };

export function OfferFeed() {
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });
  const [offers, setOffers] = useState<NearbyOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        `/api/offers/nearby?lat=${geo.lat}&lng=${geo.lng}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load offers.");
      setOffers(json.offers as NearbyOffer[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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
        <button onClick={requestGeo} className="btn-secondary">
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
        <button onClick={requestGeo} className="btn-primary mt-4">
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
          onClick={loadOffers}
          className="rounded-full bg-white px-3 py-1 ring-1 ring-ink-200 hover:bg-ink-100"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

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

      {offers && offers.length === 0 && !loading && (
        <div className="card p-6 text-center">
          <h2 className="text-base font-semibold">No live offers right now</h2>
          <p className="mt-1 text-sm text-ink-900/70">
            Offers only appear during a merchant’s slow hours. Check back later
            or pin a different location.
          </p>
        </div>
      )}

      {offers && offers.length > 0 && (
        <div className="space-y-4">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}
