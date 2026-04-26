"use client";

import { useCallback, useRef, useState } from "react";
import { QRScanner } from "@/components/QRScanner";

type Tab = "qr" | "code";
type Result = {
  ok: boolean;
  message: string;
  detail?: string;
};

export function ScannerView() {
  const [tab, setTab] = useState<Tab>("qr");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState("");
  const lastSubmittedRef = useRef<string>("");
  const lastSubmittedAtRef = useRef<number>(0);

  const submit = useCallback(
    async (input: string, method: "qr" | "code") => {
      if (busy) return;
      // Debounce identical scans for 4s.
      const now = Date.now();
      if (
        input === lastSubmittedRef.current &&
        now - lastSubmittedAtRef.current < 4000
      ) {
        return;
      }
      lastSubmittedRef.current = input;
      lastSubmittedAtRef.current = now;

      setBusy(true);
      setResult(null);
      try {
        const body =
          method === "qr"
            ? { payload: input, method: "qr" }
            : { code: input, method: "code" };
        const res = await fetch("/api/merchant/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setResult({
            ok: false,
            message: json.error || "Could not redeem.",
          });
        } else {
          setResult({
            ok: true,
            message: json.already
              ? "Already redeemed by this customer."
              : "Redeemed.",
            detail: `${json.discount_pct}% off · ${json.redemptions_count ?? "—"}/${json.max_redemptions ?? "—"} used`,
          });
          setCode("");
        }
      } catch (e) {
        setResult({
          ok: false,
          message: e instanceof Error ? e.message : "Network error.",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
      <div className="card p-5">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
          <button
            onClick={() => setTab("qr")}
            className={
              tab === "qr"
                ? "rounded-lg bg-white px-3 py-2 text-sm font-medium shadow-sm"
                : "rounded-lg px-3 py-2 text-sm text-ink-900/70"
            }
          >
            Scan QR
          </button>
          <button
            onClick={() => setTab("code")}
            className={
              tab === "code"
                ? "rounded-lg bg-white px-3 py-2 text-sm font-medium shadow-sm"
                : "rounded-lg px-3 py-2 text-sm text-ink-900/70"
            }
          >
            Enter code
          </button>
        </div>

        <div className="mt-4">
          {tab === "qr" ? (
            <QRScanner
              active
              onResult={(decoded) => submit(decoded, "qr")}
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) submit(code.trim(), "code");
              }}
              className="space-y-3"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BAKE-7K2Q"
                className="input text-center font-mono text-xl tracking-[0.3em]"
                autoCapitalize="characters"
              />
              <button className="btn-primary w-full" disabled={busy || !code}>
                {busy ? "Redeeming…" : "Redeem"}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card flex flex-col p-5">
        <h2 className="text-base font-semibold">Result</h2>
        <div className="mt-3 flex-1">
          {!result && (
            <p className="text-sm text-ink-900/60">
              Waiting for a scan or code entry…
            </p>
          )}
          {result && (
            <div
              className={
                result.ok
                  ? "rounded-xl bg-accent-50 p-4 text-accent-700 ring-1 ring-accent-100"
                  : "rounded-xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200"
              }
            >
              <div className="text-base font-semibold">{result.message}</div>
              {result.detail && (
                <div className="mt-1 text-sm">{result.detail}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
