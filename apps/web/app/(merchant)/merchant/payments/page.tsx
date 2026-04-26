import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOrgContext } from "@/lib/auth/membership";
import { stripeConfigured } from "@/lib/stripe/server";
import type { Payment } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function formatAmount(amount: number, currency: string) {
  return (amount / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: { onboarded?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/merchant/login");

  const ctx = await ensureOrgContext();
  if (!ctx) redirect("/merchant/login");

  const org = ctx.organization;
  const configured = stripeConfigured();
  const justOnboarded = searchParams?.onboarded === "1";

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const list = (payments as Payment[]) ?? [];
  const total = list.reduce(
    (sum, p) => (p.status === "succeeded" ? sum + p.amount : sum),
    0,
  );

  const isOwner = ctx.role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Payments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Accept cards through Stripe. We charge a {process.env.PLATFORM_FEE_PCT ?? "5"}% platform
          fee on each payment; the rest is transferred directly to your
          connected account.
        </p>
      </div>

      {!configured && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Stripe is not configured on this server (set{" "}
          <code className="text-xs">STRIPE_SECRET_KEY</code>,{" "}
          <code className="text-xs">STRIPE_PUBLISHABLE_KEY</code>, and{" "}
          <code className="text-xs">STRIPE_WEBHOOK_SECRET</code>).
        </div>
      )}

      {justOnboarded && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Stripe onboarding session complete. Status will refresh shortly via
          webhook.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          Connected account
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row
            label="Account ID"
            value={org.stripe_account_id ?? "Not connected"}
            mono
          />
          <Row label="Details submitted" value={org.stripe_details_submitted ? "Yes" : "No"} />
          <Row label="Charges enabled" value={org.stripe_charges_enabled ? "Yes" : "No"} />
          <Row label="Payouts enabled" value={org.stripe_payouts_enabled ? "Yes" : "No"} />
        </dl>

        {isOwner ? (
          configured ? (
            <a
              href="/api/stripe/connect/onboard"
              className="btn-primary mt-4 inline-flex"
            >
              {org.stripe_account_id
                ? org.stripe_charges_enabled
                  ? "Update Stripe account"
                  : "Continue onboarding"
                : "Connect Stripe"}
            </a>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              Configure Stripe env vars to enable onboarding.
            </p>
          )
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            Only the organization owner can manage Stripe onboarding.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Recent payments
          </h3>
          <span className="text-xs text-slate-500">
            Lifetime (succeeded):{" "}
            <span className="font-semibold text-slate-900">
              {formatAmount(total, list[0]?.currency ?? "usd")}
            </span>
          </span>
        </div>
        {list.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No payments yet. Customers can pay through Nearby once your
            account is set up.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">When</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2">Intent</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-700">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 font-medium text-slate-900">
                    {formatAmount(p.amount, p.currency)}
                  </td>
                  <td className="py-2 text-slate-700">{p.status}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">
                    {p.stripe_payment_intent_id.slice(0, 16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-slate-900 ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
