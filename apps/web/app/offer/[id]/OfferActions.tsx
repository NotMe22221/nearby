"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  acceptOfferLocal,
  dismissOfferLocal,
  isAcceptedLocal,
} from "@/lib/customer/session";

export function OfferActions({
  offerId,
  expiresAt,
}: {
  offerId: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);

  const expired = new Date(expiresAt).getTime() <= Date.now();
  const alreadyAccepted =
    typeof window !== "undefined" && isAcceptedLocal(offerId);

  if (expired) {
    return (
      <div className="card mt-4 p-6 text-center text-sm text-ink-900/70">
        This offer has ended.
      </div>
    );
  }

  function onAccept() {
    setBusy("accept");
    acceptOfferLocal(offerId);
    router.push(`/redeem/${offerId}`);
  }

  function onDismiss() {
    setBusy("dismiss");
    dismissOfferLocal(offerId);
    router.push("/");
  }

  return (
    <div className="sticky bottom-4 mt-6 flex gap-3">
      <button
        onClick={onDismiss}
        className="btn-secondary flex-1"
        disabled={busy !== null}
      >
        Dismiss
      </button>
      <button
        onClick={onAccept}
        className="btn-primary flex-1"
        disabled={busy !== null}
      >
        {alreadyAccepted ? "Open code" : "Accept offer"}
      </button>
    </div>
  );
}
