import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOrgContext, getPrimaryLocation } from "@/lib/auth/membership";
import { squareConfigured } from "@/lib/square/client";
import type {
  Item,
  PosRedemption,
  SquareConnection,
  SquareItemLink,
} from "@/lib/supabase/types";
import PosManager from "./PosManager";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams?: { connected?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/merchant/login");

  const ctx = await ensureOrgContext();
  if (!ctx) redirect("/merchant/login");

  const primary = await getPrimaryLocation();
  const items: Item[] = primary
    ? ((
        await supabase
          .from("items")
          .select("*")
          .eq("location_id", primary.location.id)
      ).data as Item[]) ?? []
    : [];

  const itemIds = items.map((i) => i.id);
  const { data: links } = itemIds.length
    ? await supabase
        .from("square_item_links")
        .select("*")
        .in("item_id", itemIds)
    : { data: [] as SquareItemLink[] };

  const { data: conn } = await supabase
    .from("square_connections")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const connection = conn as SquareConnection | null;

  // Recent POS redemptions for the org.
  const { data: posList } = primary
    ? await supabase
        .from("pos_redemptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] as PosRedemption[] };

  const configured = squareConfigured();
  const isOwner = ctx.role === "owner";
  const canEdit = ctx.role === "owner" || ctx.role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">POS — Square</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect Square Sandbox so Nearby can push refunds (= discounts)
          when a customer redeems an offer at your register, and grant stamps
          when they buy a linked item.
        </p>
      </div>

      {!configured && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Square is not configured on this server. Set{" "}
          <code className="text-xs">SQUARE_APPLICATION_ID</code>,{" "}
          <code className="text-xs">SQUARE_APPLICATION_SECRET</code>, and{" "}
          <code className="text-xs">SQUARE_WEBHOOK_SIGNATURE_KEY</code>.
        </div>
      )}

      {searchParams?.connected === "1" && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Square connected.
        </div>
      )}
      {searchParams?.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          {searchParams.error}
        </div>
      )}

      <PosManager
        connection={connection}
        items={items}
        links={(links as SquareItemLink[]) ?? []}
        recent={(posList as PosRedemption[]) ?? []}
        configured={configured}
        canEdit={canEdit}
        isOwner={isOwner}
      />
    </div>
  );
}
