import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryLocation } from "@/lib/auth/membership";
import type { Item, OfferRule } from "@/lib/supabase/types";
import Link from "next/link";
import { RulesManager } from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const lp = await getPrimaryLocation();

  if (!lp) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Offer rules</h1>
        <div className="card mt-6 p-6">
          <p>You need to set up your business profile first.</p>
          <Link href="/merchant/setup" className="btn-primary mt-4 inline-flex">
            Go to setup
          </Link>
        </div>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const [items, rules] = await Promise.all([
    supabase
      .from("items")
      .select("*")
      .eq("location_id", lp.location.id)
      .order("name"),
    supabase
      .from("offer_rules")
      .select("*")
      .eq("location_id", lp.location.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Offer rules</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Define the constraints. The generator stays inside these caps and the
        per-item discount limits.
      </p>
      <p className="mt-1 text-xs text-ink-900/60">
        Your role: <span className="font-medium">{lp.org.role}</span>. Staff
        rules need a manager to approve before they generate offers.
      </p>
      <div className="mt-6">
        <RulesManager
          items={(items.data as Item[]) ?? []}
          rules={(rules.data as OfferRule[]) ?? []}
          role={lp.org.role}
        />
      </div>
    </main>
  );
}
