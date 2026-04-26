import { ScannerView } from "./ScannerView";

export const dynamic = "force-dynamic";

export default function ScannerPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Redeem an offer</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Scan a customer’s QR or type their code. Each redemption increments the
        cap on the offer.
      </p>
      <div className="mt-6">
        <ScannerView />
      </div>
    </main>
  );
}
