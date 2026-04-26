import Link from "next/link";
import { OfferFeed } from "./_components/OfferFeed";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">
            Nearby
          </h1>
          <p className="text-sm text-ink-900/60">
            Live offers from independent shops near you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/wallet"
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-900/80 ring-1 ring-ink-200 hover:bg-ink-100"
          >
            Wallet
          </Link>
          <Link
            href="/merchant"
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-900/80 ring-1 ring-ink-200 hover:bg-ink-100"
          >
            Merchant
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <OfferFeed />
      </div>
    </main>
  );
}
