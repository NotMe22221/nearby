import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CountdownChip } from "@/components/CountdownChip";
import type { Offer, Redemption } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function MerchantOfferPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: offerRow } = await supabase
    .from("offers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!offerRow) notFound();
  const offer = offerRow as Offer;

  // RLS will only return redemptions belonging to the merchant's offers.
  const { data: redemptions } = await supabase
    .from("redemptions")
    .select("*")
    .eq("offer_id", offer.id)
    .order("redeemed_at", { ascending: false });

  const list = (redemptions as Redemption[]) ?? [];
  const w = offer.context_snapshot?.weather;

  return (
    <main>
      <Link
        href="/merchant"
        className="text-sm text-ink-900/60 hover:underline"
      >
        &larr; back to overview
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-accent-600">
            {offer.discount_pct}% off
          </div>
          <CountdownChip expiresAt={offer.expires_at} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{offer.headline}</h1>
        <p className="mt-2 text-sm text-ink-900/80">{offer.generated_text}</p>
        <p className="mt-2 text-xs italic text-ink-900/60">
          {offer.scarcity_text}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Code" value={offer.redemption_code} mono />
          <Stat
            label="Redemptions"
            value={`${offer.redemptions_count} / ${offer.max_redemptions}`}
          />
          <Stat
            label="Expires"
            value={new Date(offer.expires_at).toLocaleString()}
          />
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-base font-semibold">Context snapshot</h2>
          <p className="mt-1 text-xs text-ink-900/60">
            The real-world signals the LLM saw when this offer was generated.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Generated at">
              {new Date(offer.created_at).toLocaleString()}
            </Row>
            <Row label="Slow window reason">
              {offer.context_snapshot?.slow_hour_reason ?? "—"}
            </Row>
            <Row label="Weather">
              {w
                ? `${w.description}, ${w.temp_c}°C`
                : "Unavailable (no API key configured)"}
            </Row>
            <Row label="Local events">
              {offer.context_snapshot?.events?.length
                ? offer.context_snapshot.events
                    .slice(0, 3)
                    .map((e) => e.name)
                    .join(" · ")
                : "None nearby"}
            </Row>
            <Row label="Loyalty hint">
              {offer.context_snapshot?.loyalty_hint
                ? `${offer.context_snapshot.loyalty_hint.stamps}/${offer.context_snapshot.loyalty_hint.required} → ${offer.context_snapshot.loyalty_hint.reward_text}`
                : "—"}
            </Row>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold">Items in this offer</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {offer.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span>{item.name}</span>
                <span className="text-ink-900/60">
                  base ${item.base_price.toFixed(2)} · ≤{item.max_discount_pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Redemption log</h2>
        <div className="card mt-2 divide-y divide-ink-200/60">
          {list.length === 0 && (
            <div className="p-5 text-sm text-ink-900/60">
              No redemptions yet.
            </div>
          )}
          {list.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 p-4 text-sm"
            >
              <div>
                <div className="font-mono text-xs text-ink-900/80">
                  {r.customer_session_id.slice(0, 12)}…
                </div>
                <div className="text-xs text-ink-900/60">
                  {new Date(r.redeemed_at).toLocaleString()}
                </div>
              </div>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs uppercase tracking-wide text-ink-900/70">
                {r.method}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-ink-50 p-4">
      <div className="text-xs uppercase tracking-wide text-ink-900/60">
        {label}
      </div>
      <div className={mono ? "mt-1 font-mono text-lg" : "mt-1 text-base"}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="w-1/3 text-xs uppercase tracking-wide text-ink-900/60">
        {label}
      </dt>
      <dd className="w-2/3 text-right">{children}</dd>
    </div>
  );
}
