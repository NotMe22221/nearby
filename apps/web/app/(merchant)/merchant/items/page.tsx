import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryLocation } from "@/lib/auth/membership";
import type { Item } from "@/lib/supabase/types";
import { ItemsManager } from "./ItemsManager";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const lp = await getPrimaryLocation();

  if (!lp) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Items</h1>
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
  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("location_id", lp.location.id)
    .order("created_at", { ascending: true });

  return (
    <main>
      <h1 className="text-2xl font-semibold">Items</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Add the items you’d like to promote. Toggle which can appear in offers
        and cap the discount per item.
      </p>
      <div className="mt-6">
        <ItemsManager items={(items as Item[]) ?? []} />
      </div>
    </main>
  );
}
