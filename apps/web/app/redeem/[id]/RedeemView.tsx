"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CountdownChip } from "@/components/CountdownChip";
import { QRDisplay } from "@/components/QRDisplay";
import { getOrCreateSessionId } from "@/lib/customer/session";
import { PayTab } from "@/components/PayTab";
import type { Offer } from "@/lib/supabase/types";

type Tab = "code" | "qr" | "pay";

export function RedeemView({
  offer,
  merchantName,
  merchantAddress,
  stripeEnabled,
}: {
  offer: Offer;
  merchantName: string;
  merchantAddress: string;
  stripeEnabled: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("code");
  const [count, setCount] = useState<number>(offer.redemptions_count);
  const [maxRedemptions] = useState<number>(offer.max_redemptions);

  const [qrPayload, setQrPayload] = useState<string>("");
  useEffect(() => {
    const sid = getOrCreateSessionId();
    const payload = JSON.stringify({
      v: 1,
      code: offer.redemption_code,
      session: sid,
    });
    setQrPayload(payload);
  }, [offer.redemption_code]);

  useEffect(() => {
    let stopped = false;
    const sid = typeof window !== "undefined" ? getOrCreateSessionId() : "";

    async function poll() {
      try {
        const res = await fetch(`/api/offers/${offer.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const cur = json.offer as Offer;
        if (stopped) return;
        setCount(cur.redemptions_count);

        const checkRes = await fetch(
          `/api/offers/${offer.id}/redeemed-by?session=${encodeURIComponent(sid)}`,
          { cache: "no-store" },
        );
        if (checkRes.ok) {
          const c = await checkRes.json();
          if (c.redeemed) {
            router.replace(`/confirmed/${offer.id}`);
          }
        }
      } catch {
        // ignored
      }
    }

    poll();
    const id = setInterval(poll, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [offer.id, router]);

  const remaining = Math.max(0, maxRedemptions - count);
  const expired = new Date(offer.expires_at).getTime() <= Date.now();

  const tabs: Tab[] = useMemo(
    () => (stripeEnabled ? ["code", "qr", "pay"] : ["code", "qr"]),
    [stripeEnabled],
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-accent-600">
            {merchantName}
          </div>
          <CountdownChip expiresAt={offer.expires_at} />
        </div>
        <h1 className="mt-2 text-xl font-semibold leading-snug">
          {tab === "pay" ? "Pay with Nearby" : "Show this at the register"}
        </h1>
        <p className="mt-1 text-sm text-ink-900/70">
          {offer.discount_pct}% off · {remaining} of {maxRedemptions} left
        </p>
      </div>

      <div className="card p-2">
        <div
          className="grid gap-1 rounded-xl bg-ink-100 p-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink-900 shadow-sm"
                  : "rounded-lg px-3 py-2 text-sm text-ink-900/70"
              }
            >
              {t === "code" ? "Code" : t === "qr" ? "QR" : "Pay now"}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 p-6">
          {tab === "code" && (
            <>
              <span className="text-xs uppercase tracking-wide text-ink-900/60">
                Redemption code
              </span>
              <div className="font-mono text-4xl font-semibold tracking-[0.2em] text-ink-900">
                {offer.redemption_code}
              </div>
              <p className="text-center text-xs text-ink-900/60">
                Read this aloud at the register or have the merchant type it.
              </p>
            </>
          )}
          {tab === "qr" && (
            <>
              <QRDisplay value={qrPayload || offer.redemption_code} />
              <p className="text-center text-xs text-ink-900/60">
                Have the merchant scan this with their Nearby scanner.
              </p>
            </>
          )}
          {tab === "pay" && stripeEnabled && (
            <PayTab offer={offer} />
          )}
        </div>
      </div>

      {expired && (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-900/80">
          This offer has ended.
        </div>
      )}

      {merchantAddress && (
        <p className="text-center text-xs text-ink-900/60">
          {merchantAddress}
        </p>
      )}
    </div>
  );
}
