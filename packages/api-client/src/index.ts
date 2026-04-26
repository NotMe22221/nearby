import type {
  Offer,
  StampCard,
  Organization,
} from "@city-wallet/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type ApiClientConfig = {
  /** Base URL of the Next.js web app, e.g. https://city-wallet.example.com */
  baseUrl: string;
  /** Optional fetch implementation (use the platform default by default) */
  fetchImpl?: typeof fetch;
  /** Optional bearer token (Supabase access token) for authenticated calls */
  getAuthToken?: () => string | null | Promise<string | null>;
};

export class ApiClient {
  constructor(private cfg: ApiClientConfig) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const fetchImpl = this.cfg.fetchImpl ?? fetch;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const token = this.cfg.getAuthToken
      ? await this.cfg.getAuthToken()
      : null;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const url = path.startsWith("http") ? path : `${this.cfg.baseUrl}${path}`;
    const res = await fetchImpl(url, { ...init, headers });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // not json
      }
    }
    if (!res.ok) {
      const msg =
        (json as { error?: string } | null)?.error ||
        `Request failed: ${res.status}`;
      throw new ApiError(msg, res.status, json);
    }
    return json as T;
  }

  // -------------------------------------------------------------------------
  // Offers
  // -------------------------------------------------------------------------

  async fetchNearby(params: {
    lat: number;
    lng: number;
    sessionId?: string;
    radiusKm?: number;
  }): Promise<{ offers: NearbyOffer[] }> {
    const q = new URLSearchParams({
      lat: String(params.lat),
      lng: String(params.lng),
    });
    if (params.radiusKm) q.set("radius_km", String(params.radiusKm));
    if (params.sessionId) q.set("session", params.sessionId);
    return this.request(`/api/offers/nearby?${q.toString()}`);
  }

  async fetchOffer(id: string): Promise<{ offer: OfferWithMerchant }> {
    return this.request(`/api/offers/${id}`);
  }

  async checkRedeemed(
    offerId: string,
    sessionId: string,
  ): Promise<{ redeemed: boolean }> {
    return this.request(
      `/api/offers/${offerId}/redeemed-by?session=${encodeURIComponent(sessionId)}`,
    );
  }

  async merchantRedeem(payload: {
    code?: string;
    payload?: string;
    method?: "qr" | "code";
  }) {
    return this.request<{
      ok: boolean;
      already?: boolean;
      offer_id: string;
      discount_pct: number;
      redemptions_count?: number;
      max_redemptions?: number;
    }>(`/api/merchant/redeem`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // -------------------------------------------------------------------------
  // Loyalty
  // -------------------------------------------------------------------------

  async fetchWallet(sessionId: string): Promise<{
    orgs: WalletOrgSummary[];
    granted: WalletGrantedOffer[];
  }> {
    return this.request(
      `/api/wallet?session=${encodeURIComponent(sessionId)}`,
    );
  }

  async spendPoints(payload: {
    session_id: string;
    organization_id: string;
  }): Promise<{ offer_id: string; code: string }> {
    return this.request(`/api/wallet/spend`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  async createPaymentIntent(payload: {
    offerId: string;
    sessionId: string;
  }): Promise<{
    client_secret: string;
    publishable_key: string;
    stripe_account: string;
    amount: number;
    currency: string;
  }> {
    return this.request(`/api/payments/intent`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // -------------------------------------------------------------------------
  // Devices (push registration)
  // -------------------------------------------------------------------------

  async registerDevice(payload: {
    sessionId: string;
    expoPushToken: string;
    lat?: number;
    lng?: number;
  }): Promise<{ ok: true }> {
    return this.request(`/api/devices/register`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Response types (kept narrow to avoid web/mobile coupling on internals)
// ---------------------------------------------------------------------------

export type NearbyOffer = Offer & {
  merchant_name: string;
  merchant_address: string;
  organization_id: string;
  distance_km: number;
  stripe_enabled: boolean;
};

export type OfferWithMerchant = Offer & {
  merchant_name: string;
  merchant_address: string;
  organization_id: string;
  stripe_enabled: boolean;
};

export type WalletOrgSummary = {
  organization: Pick<Organization, "id" | "name">;
  points: number;
  stamps: Array<{
    card: StampCard;
    stamps: number;
    completed_rewards: number;
  }>;
};

export type WalletGrantedOffer = {
  offer: Pick<
    Offer,
    | "id"
    | "headline"
    | "discount_pct"
    | "expires_at"
    | "redemptions_count"
    | "max_redemptions"
  >;
  granted_at: string;
};
