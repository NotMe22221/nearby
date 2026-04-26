"use client";

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { getOrCreateSessionId } from "@/lib/customer/session";
import type { Offer } from "@/lib/supabase/types";

type IntentResponse = {
  client_secret: string;
  publishable_key: string;
  stripe_account: string;
  amount: number;
  currency: string;
};

const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(publishableKey: string) {
  // Destination charges run on the platform account, so we don't pass
  // stripeAccount here.
  if (!stripeCache.has(publishableKey)) {
    stripeCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripeCache.get(publishableKey)!;
}

export function PayTab({ offer }: { offer: Offer }) {
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    fetch(`/api/payments/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, sessionId: sid }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to start payment");
        setIntent(json as IntentResponse);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [offer.id]);

  if (error) {
    return (
      <p className="text-center text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!intent) {
    return (
      <p className="text-center text-sm text-ink-900/60">
        Preparing payment…
      </p>
    );
  }

  return <PayInner intent={intent} offerId={offer.id} />;
}

function PayInner({ intent, offerId }: { intent: IntentResponse; offerId: string }) {
  const stripePromise = useMemo(
    () => getStripe(intent.publishable_key),
    [intent.publishable_key],
  );
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: intent.client_secret,
        appearance: { theme: "stripe" },
      }}
    >
      <PayForm
        offerId={offerId}
        amount={intent.amount}
        currency={intent.currency}
      />
    </Elements>
  );
}

function PayForm({
  offerId,
  amount,
  currency,
}: {
  offerId: string;
  amount: number;
  currency: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url:
          typeof window !== "undefined"
            ? `${window.location.origin}/confirmed/${offerId}`
            : "https://example.com",
      },
    });
    if (result.error) {
      setErr(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // Otherwise the page redirects via return_url.
  }

  const display = (amount / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <p className="text-center text-sm text-ink-900/70">
        Total after discount · <span className="font-semibold">{display}</span>
      </p>
      <PaymentElement />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="btn-primary w-full"
      >
        {submitting ? "Processing…" : `Pay ${display}`}
      </button>
      <p className="text-center text-[11px] text-ink-900/50">
        Test mode · use 4242 4242 4242 4242 with any future date / CVC.
      </p>
    </form>
  );
}
