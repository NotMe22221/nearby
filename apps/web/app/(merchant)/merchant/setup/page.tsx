import { ensureOrgContext } from "@/lib/auth/membership";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function MerchantSetupPage() {
  const ctx = await ensureOrgContext();
  const location = ctx?.locations[0] ?? null;

  return (
    <main>
      <h1 className="text-2xl font-semibold">Business profile</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Set the basics for your storefront. Your address is geocoded with
        OpenStreetMap so nearby customers can see your offers.
      </p>
      <p className="mt-1 text-xs text-ink-900/60">
        Need multiple stores? Use{" "}
        <a className="text-accent-600 underline" href="/merchant/locations">
          Locations
        </a>{" "}
        instead.
      </p>
      <div className="mt-6">
        <SetupForm initial={location} />
      </div>
    </main>
  );
}
