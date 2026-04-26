"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { getOrCreateSessionId } from "@/lib/customer/session";
import type {
  WalletGrantedOffer,
  WalletOrgSummary,
} from "@/app/api/wallet/route";

const POINTS_COST = 200;

export default function WalletView() {
  const [sessionId, setSessionId] = useState<string>("");
  const [orgs, setOrgs] = useState<WalletOrgSummary[] | null>(null);
  const [granted, setGranted] = useState<WalletGrantedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  async function refresh(sid: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/wallet?session=${encodeURIComponent(sid)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      const json = (await r.json()) as {
        orgs: WalletOrgSummary[];
        granted: WalletGrantedOffer[];
      };
      setOrgs(json.orgs);
      setGranted(json.granted);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    refresh(sessionId);
  }, [sessionId]);

  if (!sessionId || loading) {
    return (
      <div className="card p-6 text-sm text-ink-900/60">Loading wallet…</div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-sm text-red-700">{error}</div>
    );
  }

  if (!orgs || orgs.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-900/60">
        Visit a participating merchant to start earning stamps and points.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {granted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-900/60">
            Loyalty offers
          </h2>
          <div className="mt-3 space-y-3">
            {granted.map((g) => (
              <GrantedOfferCard key={g.offer.id} g={g} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-900/60">
          Merchants
        </h2>
        <div className="mt-3 space-y-3">
          {orgs.map((o) => (
            <OrgCard
              key={o.organization.id}
              summary={o}
              sessionId={sessionId}
              onSpent={() => refresh(sessionId)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function GrantedOfferCard({ g }: { g: WalletGrantedOffer }) {
  const used = g.offer.redemptions_count >= g.offer.max_redemptions;
  const expired = new Date(g.offer.expires_at).getTime() < Date.now();
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-900">{g.offer.headline}</p>
          <p className="text-xs text-ink-900/60">
            {g.offer.discount_pct}% off · expires{" "}
            {new Date(g.offer.expires_at).toLocaleString()}
          </p>
        </div>
        {used ? (
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-900/70">
            Used
          </span>
        ) : expired ? (
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-900/70">
            Expired
          </span>
        ) : (
          <Link
            href={`/redeem/${g.offer.id}`}
            className="rounded-full bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
          >
            Redeem
          </Link>
        )}
      </div>
    </div>
  );
}

function OrgCard({
  summary,
  sessionId,
  onSpent,
}: {
  summary: WalletOrgSummary;
  sessionId: string;
  onSpent: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function spend() {
    setError(null);
    start(async () => {
      const r = await fetch(`/api/wallet/spend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          organization_id: summary.organization.id,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        try {
          setError(JSON.parse(t).error ?? t);
        } catch {
          setError(t);
        }
        return;
      }
      onSpent();
    });
  }

  const canSpend = summary.points >= POINTS_COST;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-900">
          {summary.organization.name}
        </h3>
        <span className="text-sm font-medium text-accent-700">
          {summary.points} pts
        </span>
      </div>

      {summary.stamps.length > 0 && (
        <div className="mt-4 space-y-3">
          {summary.stamps.map(({ card, stamps, completed_rewards }) => {
            const ratio = Math.min(1, stamps / card.stamps_required);
            return (
              <div key={card.id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{card.name}</span>
                  <span className="text-xs text-ink-900/60">
                    {stamps % card.stamps_required}/{card.stamps_required}
                    {completed_rewards > 0 && (
                      <> · {completed_rewards} earned</>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full bg-accent-600 transition-all"
                    style={{
                      width: `${
                        ((stamps % card.stamps_required) /
                          card.stamps_required) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-900/60">
                  Reward: {card.reward_text}
                  {ratio >= 1 && " — ready to claim!"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-900/60">
          Spend {POINTS_COST} points for a one-time 10% off perk.
        </p>
        <button
          disabled={!canSpend || pending}
          onClick={spend}
          className="rounded-full bg-ink-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {pending ? "Minting…" : "Spend points"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
