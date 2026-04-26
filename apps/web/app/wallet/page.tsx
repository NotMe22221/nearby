import Link from "next/link";
import WalletView from "./WalletView";

export const dynamic = "force-dynamic";

export default function WalletPage() {
  return (
    <main className="app-shell">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">My wallet</h1>
          <p className="text-sm text-ink-900/60">
            Stamps, points, and granted offers across the merchants you visit.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-900/80 ring-1 ring-ink-200 hover:bg-ink-100"
        >
          ← Offers
        </Link>
      </header>

      <div className="mt-6">
        <WalletView />
      </div>
    </main>
  );
}
