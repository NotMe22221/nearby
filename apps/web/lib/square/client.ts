import { readEnv } from "@/lib/supabase/env";

// Lazy-load the Square SDK so apps that don't use POS don't pay the cost.
type SquareClientType = unknown;
let _square: SquareClientType | null = null;

export type SquareEnvironment = "sandbox" | "production";

export function squareEnvironment(): SquareEnvironment {
  return (readEnv("SQUARE_ENVIRONMENT") as SquareEnvironment) || "sandbox";
}

export function squareApplicationId(): string | null {
  return readEnv("SQUARE_APPLICATION_ID") ?? null;
}

export function squareApplicationSecret(): string | null {
  return readEnv("SQUARE_APPLICATION_SECRET") ?? null;
}

export function squareWebhookSignatureKey(): string | null {
  return readEnv("SQUARE_WEBHOOK_SIGNATURE_KEY") ?? null;
}

export function squareConfigured(): boolean {
  return !!squareApplicationId() && !!squareApplicationSecret();
}

export function squareOauthBaseUrl(): string {
  return squareEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function squareApiBaseUrl(): string {
  return squareEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

/**
 * Returns the Square SDK Client (typed as `unknown` to avoid hard linkage
 * when the package isn't installed in some build contexts).
 */
export async function squareClient(accessToken: string): Promise<unknown> {
  // Dynamic require to keep tree-shake happy in the customer bundle.
  // The square npm package is CommonJS.
  const mod = await import("square");
  // square v38 exports { Client, Environment }
  const Client = (mod as { Client?: new (opts: unknown) => unknown }).Client;
  const Environment = (mod as { Environment?: Record<string, string> })
    .Environment;
  if (!Client || !Environment) {
    throw new Error("square SDK not available in this runtime");
  }
  const env =
    squareEnvironment() === "production"
      ? Environment.Production
      : Environment.Sandbox;
  return new Client({
    accessToken,
    environment: env,
  });
}

export type SquareRedemptionResult = {
  status: "applied" | "manual" | "error";
  payment_id?: string;
  refund_id?: string;
  error?: string;
};

/**
 * Best-effort: find the most recent open Square payment at the location and
 * push a partial refund equal to the discount percentage. If we can't (no
 * matching payment, no SDK, no token), return "manual" so the scanner UI can
 * tell the merchant to apply the discount at the register manually.
 */
export async function applySquareDiscountForRedemption(opts: {
  accessToken: string;
  squareLocationId: string | null;
  offerId: string;
  discountPct: number;
  customerSessionId: string;
}): Promise<SquareRedemptionResult> {
  if (!opts.squareLocationId) {
    return { status: "manual", error: "No Square location selected" };
  }
  try {
    const client = (await squareClient(opts.accessToken)) as {
      paymentsApi: {
        listPayments: (q: Record<string, unknown>) => Promise<{
          result?: { payments?: Array<{ id?: string; amountMoney?: { amount?: bigint | number; currency?: string } }> };
        }>;
      };
      refundsApi: {
        refundPayment: (body: Record<string, unknown>) => Promise<{
          result?: { refund?: { id?: string } };
        }>;
      };
    };

    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const list = await client.paymentsApi.listPayments({
      locationId: opts.squareLocationId,
      beginTime: since,
      sortOrder: "DESC",
      limit: 5,
    });
    const payment = list.result?.payments?.[0];
    if (!payment?.id || !payment.amountMoney?.amount) {
      return { status: "manual", error: "No recent Square payment found" };
    }
    const totalCents =
      typeof payment.amountMoney.amount === "bigint"
        ? Number(payment.amountMoney.amount)
        : payment.amountMoney.amount;
    const refundAmount = Math.max(
      1,
      Math.round((totalCents * opts.discountPct) / 100),
    );
    const refund = await client.refundsApi.refundPayment({
      idempotencyKey: `cw_${opts.offerId}_${opts.customerSessionId}`,
      paymentId: payment.id,
      amountMoney: {
        amount: BigInt(refundAmount),
        currency: payment.amountMoney.currency || "USD",
      },
      reason: `Nearby ${opts.discountPct}% off`,
    });
    return {
      status: "applied",
      payment_id: payment.id,
      refund_id: refund.result?.refund?.id,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Reference to keep the lazy-load symbol used. Build optimizers may strip
// otherwise.
export const __square_loaded = _square;
