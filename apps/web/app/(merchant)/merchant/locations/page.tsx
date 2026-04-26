import Link from "next/link";
import { ensureOrgContext } from "@/lib/auth/membership";
import { LocationsManager } from "./LocationsManager";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const ctx = await ensureOrgContext();
  if (!ctx) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Locations</h1>
      </main>
    );
  }

  const canEdit = ctx.role === "owner" || ctx.role === "manager";

  return (
    <main>
      <h1 className="text-2xl font-semibold">Locations</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        One row per storefront. Items, rules, and offers all attach to a
        location.
      </p>

      {!canEdit && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          You’re a {ctx.role}. Only owners or managers can add locations.
        </div>
      )}

      <div className="mt-6">
        <LocationsManager
          locations={ctx.locations}
          canEdit={canEdit}
        />
      </div>

      <div className="mt-6 text-xs text-ink-900/60">
        Looking for the legacy single-location page?{" "}
        <Link className="text-accent-600 underline" href="/merchant/setup">
          Open setup
        </Link>
        .
      </div>
    </main>
  );
}
