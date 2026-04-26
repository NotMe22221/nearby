import { ensureOrgContext } from "@/lib/auth/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Item, Location, OfferRule, RuleApproval } from "@/lib/supabase/types";
import { ApprovalsList } from "./ApprovalsList";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await ensureOrgContext();
  if (!ctx) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Approvals</h1>
      </main>
    );
  }
  const canApprove = ctx.role === "owner" || ctx.role === "manager";

  const supabase = createSupabaseServerClient();
  const locationIds = ctx.locations.map((l) => l.id);

  const [{ data: rules }, { data: items }, { data: history }] = await Promise.all([
    supabase
      .from("offer_rules")
      .select("*")
      .in("location_id", locationIds)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false }),
    supabase.from("items").select("*").in("location_id", locationIds),
    supabase
      .from("rule_approvals")
      .select("*")
      .order("decided_at", { ascending: false })
      .limit(20),
  ]);

  const ruleList = (rules as OfferRule[]) ?? [];
  const itemMap = new Map<string, Item>();
  ((items as Item[]) ?? []).forEach((i) => itemMap.set(i.id, i));
  const locMap = new Map<string, Location>();
  ctx.locations.forEach((l) => locMap.set(l.id, l));

  return (
    <main>
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        {canApprove
          ? "Review pending rules. Approving lets the offer generator pick them up immediately."
          : "Read-only view: only owners and managers can approve."}
      </p>
      <div className="mt-6">
        <ApprovalsList
          rules={ruleList}
          items={itemMap}
          locations={locMap}
          history={(history as RuleApproval[]) ?? []}
          canApprove={canApprove}
        />
      </div>
    </main>
  );
}
