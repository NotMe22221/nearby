# Nearby

Real-time, context-aware offers for independent local businesses. Built for Hack Nation 2026.

Nearby uses **real signals** — browser/native geolocation, OpenWeather, the merchant's slow-hour rules, local Ticketmaster events, and an LLM — to dynamically generate limited promotional offers. Customers redeem via short code, QR, or by paying directly through Stripe Connect. Merchants can sync redemptions to a Square Sandbox POS, manage multi-location organizations with role-gated approvals, and reward repeat visits with stamp cards + points.

## What's in the box

- **Web app** (Next.js 14, App Router, TypeScript, Tailwind, Supabase RLS) — customer feed, wallet, offer detail, redeem, confirmation; merchant dashboard for items, rules, approvals, locations, team, loyalty, payments, POS, and a QR scanner.
- **Mobile app** (Expo / React Native + expo-router) — native offer feed (FlashList + expo-location), offer detail, redeem (Code / QR / Stripe PaymentSheet), confirmed (haptics), wallet (stamps + points + spend-points), and the merchant scanner (expo-camera).
- **Stripe Connect Express** — merchant onboarding, destination charges with platform fee, webhooks that auto-redeem on `payment_intent.succeeded`.
- **Square Sandbox POS** — OAuth, catalog sync, per-item link mapping, outbound discount/refund on each redemption, inbound webhook that grants stamps on linked-item purchases.
- **Loyalty** — stamp cards, points ledger, "spend points to mint a one-time perk" flow.
- **Ticketmaster Discovery** — local events thread into the LLM context so offers can ride foot-traffic spikes.
- **Multi-location orgs + approvals** — `organizations`, `locations`, `memberships(owner|manager|staff)`, and a rule-status workflow (`draft → pending → approved → rejected`).
- **Push notifications** — Expo push registry + a Supabase Edge Function that fans out new offers to nearby devices.

No mock data: weather, events, location, time, distance, Stripe payments, and Square refunds are all real (test/sandbox).

## Monorepo layout

```
city-wallet/
  apps/
    web/                       Next.js 14 (existing app moved under here)
    mobile/                    Expo / React Native + expo-router
  packages/
    types/                     Shared row + value types
    api-client/                Typed API client used by web + mobile
  db/
    schema.sql                 Phase 0 baseline
    migrations/
      2_orgs.sql               organizations, locations, memberships, rule status
      3_loyalty.sql            stamp_cards, stamp_events, point_ledger, loyalty_redemptions
      4_stripe.sql             payments
      5_square.sql             square_connections, square_item_links, pos_redemptions
      6_devices.sql            devices (push registry)
    functions/
      notify_nearby_on_offer_create/   Supabase Edge Function (push fan-out)
```

Workspaces are managed with **npm workspaces** (npm ≥ 7). Use the root scripts:

```bash
npm install                # installs every workspace
npm run dev                # apps/web (http://localhost:3000)
npm run mobile             # apps/mobile (Expo dev server)
npm run typecheck          # tsc --noEmit across workspaces
```

## Setup

### 1. Provision Supabase

1. Create a Supabase project.
2. Open the SQL editor and run, in order:
   1. `db/schema.sql`
   2. `db/migrations/2_orgs.sql`
   3. `db/migrations/3_loyalty.sql`
   4. `db/migrations/4_stripe.sql`
   5. `db/migrations/5_square.sql`
   6. `db/migrations/6_devices.sql`
   7. `db/migrations/7_fix_memberships_rls.sql` (if you ever hit RLS recursion on `memberships`, run this)
   8. `db/migrations/8_publish_offers.sql`
   9. `db/migrations/9_customer_claims.sql` (required for **Customer sign-ups** / `offer_customer_claims`)
   10. `db/migrations/10_location_cover_photos.sql` (location cover images + `locations_nearby` updates)
3. Enable **Email** auth (and disable email confirmation for demo speed).
4. (Optional) Create a Database Webhook on `public.offers` (insert) that POSTs to the Edge Function `notify_nearby_on_offer_create`.

### 2. Web env

Copy `.env.example` to `.env.local` in `apps/web/` and fill in:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `OPENAI_API_KEY` | OpenAI key (model defaults to `gpt-4o-mini`) |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o-mini` |
| `OPENWEATHER_API_KEY` | OpenWeatherMap Current Weather key |
| `NOMINATIM_USER_AGENT` | Contact email per Nominatim usage policy |
| `TICKETMASTER_API_KEY` | Discovery v2 key (Phase 5; optional, falls back to `[]`) |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key |
| `STRIPE_WEBHOOK_SECRET` | Created by `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| `PLATFORM_FEE_PCT` | Optional, default `5` |
| `SQUARE_APPLICATION_ID` | Square Sandbox app id |
| `SQUARE_APPLICATION_SECRET` | Square Sandbox app secret |
| `SQUARE_ENVIRONMENT` | `sandbox` (default) or `production` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square webhook signature key |

Set the redirect URLs on the Square dashboard:
- OAuth redirect: `http://localhost:3000/api/square/oauth/callback`
- Webhook URL: `http://localhost:3000/api/square/webhook` (subscribe to `payment.created`, `refund.created`)

Set the Stripe webhook endpoint to `http://localhost:3000/api/stripe/webhook` (subscribe to `account.updated`, `payment_intent.succeeded`, `charge.refunded`).

### 3. Mobile env

Edit `apps/mobile/app.json` and replace the `expo.extra` block (or set the matching `EXPO_PUBLIC_*` env vars):

```json
"extra": {
  "router": { "origin": false },
  "apiBaseUrl": "http://192.168.x.x:3000",
  "supabaseUrl": "https://YOUR.supabase.co",
  "supabaseAnonKey": "...",
  "stripePublishableKey": "pk_test_..."
}
```

`apiBaseUrl` must be reachable from your phone (use your laptop's LAN IP, **not** `localhost`).

### 4. Run

```bash
# Terminal 1 — web
npm run dev

# Terminal 2 — Stripe webhook forwarder (optional, for live payments)
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Terminal 3 — mobile
npm run mobile
# Scan the QR with Expo Go on your phone.
```

## Demo script (≤6 minutes)

1. **Sign up** at `/merchant`. The first session auto-creates an organization with you as `owner`.
2. **Locations** → add your storefront (auto-geocoded). **Items** → add at least one offer-eligible item. **Rules** → create a rule (rule auto-`approved` for owners/managers).
3. **Loyalty** → add a stamp card ("Coffee club", 5 stamps → "Free drink"). **Approvals** → empty (since you're owner).
4. **Payments** → click "Connect Stripe", finish Express onboarding (test mode prefill), watch status flip to `charges_enabled` via webhook.
5. **POS** → click "Connect Square Sandbox", run "Sync catalog", and link your Nearby item to a Square catalog object.
6. Open `http://your-lan-ip:3000` (or the mobile app via Expo Go) on a phone, allow location.
   - The home feed pulls a real offer card generated by the LLM with weather + Ticketmaster events + slow-hour reason embedded in the prompt.
7. Tap the card → tap **Redeem**. Three tabs:
   - **Code** — read aloud at the register.
   - **QR** — merchant scans on `/merchant/scanner` (or the mobile **Scanner** screen). On scan, the customer's screen auto-flips to **Confirmed** with confetti + haptics, the redemption count increments, a stamp + points are credited, and a Square refund is pushed (if connected).
   - **Pay now** (only if Stripe is enabled for this merchant) — opens the Stripe Payment Element / native PaymentSheet. On `payment_intent.succeeded`, the webhook auto-redeems the offer, records the payment, mints a stamp/points, and pushes the discount to Square.
8. Customer **Wallet** (`/wallet` or the Wallet tab) shows stamp progress + point balance. Tap **Spend points** to mint a one-time 10%-off perk and redeem it.
9. Merchant **Approvals** → if you sign in as `staff` and create a rule, it lands in `pending` for an `owner`/`manager` to approve.
10. (Optional) Mobile **Profile → Enable push** to register the device. Insert a new offer (or fire the database webhook) and watch a push land on the device.

## Key files added in the expansion

- DB: `db/migrations/2_orgs.sql`, `3_loyalty.sql`, `4_stripe.sql`, `5_square.sql`, `6_devices.sql`, `db/functions/notify_nearby_on_offer_create/`
- Auth: `apps/web/lib/auth/membership.ts`
- Stripe: `apps/web/lib/stripe/server.ts`, `apps/web/app/api/stripe/connect/{onboard,refresh}`, `apps/web/app/api/payments/intent`, `apps/web/app/api/stripe/webhook`, `apps/web/components/PayTab.tsx`, `apps/web/app/(merchant)/merchant/payments`
- Square: `apps/web/lib/square/{client,redemption}.ts`, `apps/web/app/api/square/{oauth/start,oauth/callback,sync,disconnect,webhook}`, `apps/web/app/(merchant)/merchant/pos`
- Loyalty: `apps/web/lib/loyalty/{hint,record}.ts`, `apps/web/app/api/wallet/{route,spend}`, `apps/web/app/wallet`, `apps/web/app/(merchant)/merchant/loyalty`
- Events: `apps/web/lib/events/ticketmaster.ts` (cached, threaded into `lib/context/buildContext.ts`)
- Org/locations/approvals/team: `apps/web/app/(merchant)/merchant/{org,locations,approvals}`
- Devices/push: `apps/web/app/api/devices/register`, `db/functions/notify_nearby_on_offer_create`
- Mobile: `apps/mobile/app/{(tabs),offer,redeem,confirmed,scanner}`, `apps/mobile/src/lib/{api,session,supabase,push,theme,config}.ts`

## Notes / out of scope

- Stripe stays in **test mode**, Square in **sandbox**. No real money.
- Real fraud prevention beyond per-session redemption locks isn't implemented.
- Multi-currency / VAT / tax compliance is out of scope.
- Mobile distribution is **Expo Go** only; the EAS build config is committed but not run.
- Ticketmaster Discovery is US-centric; swapping to Eventbrite or PredictHQ is one file (`apps/web/lib/events/ticketmaster.ts`).
