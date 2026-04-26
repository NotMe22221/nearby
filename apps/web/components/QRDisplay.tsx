"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRDisplay({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="flex h-[320px] w-[320px] items-center justify-center rounded-xl bg-ink-100">
        <span className="text-xs text-ink-900/60">Generating QR…</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={320}
      height={320}
      className="rounded-xl bg-white p-3 shadow-card"
    />
  );
}
