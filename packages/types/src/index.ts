// Shared row + value types for City Wallet.
// Consumed by the Next.js web app and the Expo mobile app.

// ---------------------------------------------------------------------------
// Time + slow hours
// ---------------------------------------------------------------------------

export type SlowHour = {
  day: number; // 0 (Sun) - 6 (Sat)
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

// ---------------------------------------------------------------------------
// Organizations + locations + memberships (Phase 1)
// ---------------------------------------------------------------------------

export type MembershipRole = "owner" | "manager" | "staff";

export type Organization = {
  id: string;
  name: string;
  owner_user_id: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  created_at: string;
};

export type Location = {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  slow_hours: SlowHour[];
  created_at: string;
};

export type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Items + rules (Phase 1 changes: rules now have status + location_id)
// ---------------------------------------------------------------------------

export type Item = {
  id: string;
  location_id: string;
  name: string;
  base_price: number;
  offer_eligible: boolean;
  max_discount_pct: number;
  created_at: string;
};

export type OfferRuleStatus = "draft" | "pending" | "approved" | "rejected";

export type OfferRule = {
  id: string;
  location_id: string;
  name: string;
  item_ids: string[];
  discount_cap_pct: number;
  max_redemptions: number;
  time_window_start: string; // "HH:MM:SS"
  time_window_end: string; // "HH:MM:SS"
  active: boolean;
  status: OfferRuleStatus;
  created_at: string;
};

export type RuleApproval = {
  id: string;
  rule_id: string;
  decided_by: string;
  decision: "approved" | "rejected";
  note: string | null;
  decided_at: string;
};

// ---------------------------------------------------------------------------
// Offers + redemptions (Phase 5: events; Phase 2: loyalty grants)
// ---------------------------------------------------------------------------

export type WeatherSnapshot = {
  temp_c: number;
  condition: string;
  description: string;
};

export type EventSnapshot = {
  id: string;
  name: string;
  start_at: string; // ISO
  distance_km: number | null;
  classification: string | null;
};

export type OfferContextSnapshot = {
  weather: WeatherSnapshot | null;
  local_time_iso: string;
  day_of_week: number;
  slow_hour_reason: string;
  events: EventSnapshot[];
  loyalty_hint?: { stamps: number; required: number; reward_text: string } | null;
};

export type OfferItemSnapshot = {
  id: string;
  name: string;
  base_price: number;
  max_discount_pct: number;
};

export type Offer = {
  id: string;
  location_id: string;
  rule_id: string | null;
  generated_text: string;
  headline: string;
  scarcity_text: string;
  discount_pct: number;
  items: OfferItemSnapshot[];
  redemption_code: string;
  max_redemptions: number;
  redemptions_count: number;
  expires_at: string;
  context_snapshot: OfferContextSnapshot;
  granted_to_session_id: string | null;
  created_at: string;
};

export type Redemption = {
  id: string;
  offer_id: string;
  customer_session_id: string;
  redeemed_at: string;
  method: "code" | "qr" | "stripe";
};

export type NearbyLocationRow = {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  slow_hours: SlowHour[];
  distance_km: number;
};

// ---------------------------------------------------------------------------
// Loyalty (Phase 2)
// ---------------------------------------------------------------------------

export type StampCard = {
  id: string;
  organization_id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  active: boolean;
  created_at: string;
};

export type StampEvent = {
  id: string;
  stamp_card_id: string;
  customer_session_id: string;
  source: "redemption" | "purchase";
  redemption_id: string | null;
  payment_id: string | null;
  created_at: string;
};

export type PointLedgerEntry = {
  id: string;
  customer_session_id: string;
  organization_id: string;
  delta: number;
  reason: string;
  created_at: string;
};

export type LoyaltyRedemption = {
  id: string;
  customer_session_id: string;
  kind: "stamp_reward" | "points";
  points_spent: number | null;
  stamp_card_id: string | null;
  granted_offer_id: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Payments (Phase 3)
// ---------------------------------------------------------------------------

export type Payment = {
  id: string;
  offer_id: string;
  organization_id: string;
  customer_session_id: string;
  stripe_payment_intent_id: string;
  amount: number; // smallest currency unit
  currency: string;
  status: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Square POS (Phase 4)
// ---------------------------------------------------------------------------

export type SquareConnection = {
  id: string;
  organization_id: string;
  square_merchant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  square_location_id: string | null;
  created_at: string;
};

export type SquareItemLink = {
  id: string;
  item_id: string;
  square_catalog_object_id: string;
  square_variation_id: string | null;
  created_at: string;
};

export type PosRedemption = {
  id: string;
  redemption_id: string;
  square_payment_id: string | null;
  square_refund_id: string | null;
  status: "pending" | "applied" | "manual" | "error";
  error: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Push devices (Phase 6)
// ---------------------------------------------------------------------------

export type Device = {
  id: string;
  customer_session_id: string;
  expo_push_token: string;
  last_lat: number | null;
  last_lng: number | null;
  created_at: string;
  updated_at: string;
};
