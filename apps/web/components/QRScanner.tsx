"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onResult: (text: string) => void;
  active: boolean;
};

const ELEMENT_ID = "city-wallet-qr-region";

export function QRScanner({ onResult, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const { Html5Qrcode } = mod;

        const scanner = new Html5Qrcode(ELEMENT_ID, /* verbose */ false);
        scannerRef.current = {
          stop: async () => {
            try {
              await scanner.stop();
            } catch {
              // ignored
            }
            scanner.clear();
          },
          clear: () => scanner.clear(),
        };

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          (decoded) => {
            onResult(decoded);
          },
          () => {
            // ignored decode failures during scanning
          },
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not start the camera.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [active, onResult]);

  return (
    <div className="space-y-2">
      <div
        id={ELEMENT_ID}
        ref={ref}
        className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black"
      />
      {error && (
        <p className="text-center text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
