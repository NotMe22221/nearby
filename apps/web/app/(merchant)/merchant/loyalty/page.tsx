import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOrgContext } from "@/lib/auth/membership";
import type { StampCard } from "@/lib/supabase/types";
import LoyaltyManager from "./LoyaltyManager";

export default async function LoyaltyPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/merchant/login");

  const ctx = await ensureOrgContext();
  if (!ctx) redirect("/merchant/login");

  const { data: cards } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });

  // Top point holders for this org.
  const { data: ledger } = await supabase
    .from("point_ledger")
    .select("customer_session_id, delta")
    .eq("organization_id", ctx.organization.id);

  const totals = new Map<string, number>();
  for (const row of ledger ?? []) {
    totals.set(
      row.customer_session_id,
      (totals.get(row.customer_session_id) ?? 0) + row.delta,
    );
  }
  const topHolders = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Loyalty</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stamp cards reward repeat visits. Customers earn 1 stamp per
          redemption (and per linked-item Square purchase, when POS is
          connected). They also earn points based on the discount tier.
        </p>
      </div>

      <LoyaltyManager
        cards={(cards as StampCard[]) ?? []}
        canEdit={ctx.role === "owner" || ctx.role === "manager"}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          Top point holders
        </h3>
        {topHolders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No points earned yet. Customers earn points after their first
            redemption.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Session</th>
                <th className="py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {topHolders.map(([sid, pts]) => (
                <tr key={sid} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs text-slate-700">
                    {sid.slice(0, 12)}…
                  </td>
                  <td className="py-2 text-right font-semibold text-slate-900">
                    {pts}
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
