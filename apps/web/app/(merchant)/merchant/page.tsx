import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CountdownChip } from "@/components/CountdownChip";
import { DAY_LABELS } from "@/lib/time/slowHours";
import { ensureOrgContext } from "@/lib/auth/membership";
import type { Item, Offer, OfferRule, Redemption } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function MerchantOverviewPage() {
  const ctx = await ensureOrgContext();
  if (!ctx) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Welcome to Nearby</h1>
      </main>
    );
  }

  const primaryLocation = ctx.locations[0];
  if (!primaryLocation) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Welcome to Nearby</h1>
        <div className="card mt-6 p-6">
          <p className="text-sm text-ink-900/80">
            Set up your first location to start generating offers.
          </p>
          <Link href="/merchant/setup" className="btn-primary mt-4 inline-flex">
            Set up profile
          </Link>
        </div>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const locationIds = ctx.locations.map((l) => l.id);

  const [items, rules, offers, redemptionsToday, pendingRules] = await Promise.all([
    supabase.from("items").select("*").in("location_id", locationIds),
    supabase
      .from("offer_rules")
      .select("*")
      .in("location_id", locationIds)
      .eq("active", true)
      .eq("status", "approved"),
    supabase
      .from("offers")
      .select("*")
      .in("location_id", locationIds)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("redemptions")
      .select("id, offer_id, redeemed_at, method")
      .gte("redeemed_at", startOfDay.toISOString()),
    supabase
      .from("offer_rules")
      .select("id")
      .in("location_id", locationIds)
      .eq("status", "pending"),
  ]);

  const itemList = (items.data as Item[]) ?? [];
  const ruleList = (rules.data as OfferRule[]) ?? [];
  const liveOffers = (offers.data as Offer[]) ?? [];
  const todayRedemptions = (redemptionsToday.data as Redemption[]) ?? [];
  const pendingCount = pendingRules.data?.length ?? 0;

  return (
    <main>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Live status for {ctx.organization.name}.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Locations" value={ctx.locations.length} />
        <Stat label="Items" value={itemList.length} />
        <Stat label="Active rules" value={ruleList.length} />
        <Stat label="Live offers" value={liveOffers.length} />
        <Stat label="Redemptions today" value={todayRedemptions.length} />
      </section>

      {pendingCount > 0 && (
        <Link
          href="/merchant/approvals"
          className="card mt-4 flex items-center justify-between p-4 hover:bg-ink-50"
        >
          <div>
            <div className="text-xs uppercase tracking-wide text-amber-700">
              Approvals queue
            </div>
            <div className="text-sm font-medium">
              {pendingCount} rule{pendingCount === 1 ? "" : "s"} waiting for review
            </div>
          </div>
          <span className="text-accent-600">→</span>
        </Link>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Slow hours · primary location</h2>
          <Link
            href="/merchant/locations"
            className="text-xs text-accent-600 hover:underline"
          >
            Edit
          </Link>
        </div>
        <div className="card mt-2 p-4 text-sm">
          {primaryLocation.slow_hours.length === 0 ? (
            <p className="text-ink-900/60">No slow hours set yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {primaryLocation.slow_hours.map((s, i) => (
                <li
                  key={i}
                  className="rounded-full bg-ink-50 px-3 py-1 text-xs"
                >
                  {DAY_LABELS[s.day]} {s.start}–{s.end}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Live offers</h2>
        {liveOffers.length === 0 ? (
          <div className="card mt-2 p-6 text-sm text-ink-900/70">
            No live offers right now. Offers generate automatically during slow
            hours when an active rule is in its time window.
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {liveOffers.map((o) => (
              <Link
                key={o.id}
                href={`/merchant/offers/${o.id}`}
                className="card flex items-start justify-between gap-3 p-4 hover:bg-ink-50"
              >
                <div>
                  <div className="text-xs uppercase tracking-wide text-accent-600">
                    {o.discount_pct}% off
                  </div>
                  <div className="text-base font-semibold">{o.headline}</div>
                  <div className="mt-1 text-xs text-ink-900/60">
                    Code{" "}
                    <span className="font-mono">{o.redemption_code}</span> ·{" "}
                    {o.redemptions_count}/{o.max_redemptions} redeemed
                  </div>
                </div>
                <CountdownChip expiresAt={o.expires_at} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-900/60">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
