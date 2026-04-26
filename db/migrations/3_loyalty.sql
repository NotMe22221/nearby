-- City Wallet — Phase 2: Loyalty (stamp cards + points)
-- Run AFTER 2_orgs.sql.

begin;

-- Stamp cards: one or more per org; card requires N stamps for a reward.
create table if not exists public.stamp_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  stamps_required integer not null default 5 check (stamps_required between 1 and 50),
  reward_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists stamp_cards_org_idx on public.stamp_cards(organization_id);

-- Each successful redemption (or linked-item purchase) emits one stamp_event.
create table if not exists public.stamp_events (
  id uuid primary key default gen_random_uuid(),
  stamp_card_id uuid not null references public.stamp_cards(id) on delete cascade,
  customer_session_id text not null,
  source text not null check (source in ('redemption','purchase')),
  redemption_id uuid references public.redemptions(id) on delete set null,
  payment_id uuid, -- references payments(id), set up later in 4_stripe.sql
  created_at timestamptz not null default now()
);
create index if not exists stamp_events_card_idx on public.stamp_events(stamp_card_id);
create index if not exists stamp_events_session_idx on public.stamp_events(customer_session_id);

-- Point ledger: append-only entries; balance = sum(delta) per (session, org).
create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_session_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists point_ledger_session_idx on public.point_ledger(customer_session_id);
create index if not exists point_ledger_org_idx on public.point_ledger(organization_id);

-- Loyalty redemptions: when a customer cashes in stamps or points for an offer.
create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_session_id text not null,
  kind text not null check (kind in ('stamp_reward','points')),
  points_spent integer,
  stamp_card_id uuid references public.stamp_cards(id) on delete set null,
  granted_offer_id uuid references public.offers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_redemptions_session_idx
  on public.loyalty_redemptions(customer_session_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.stamp_cards enable row level security;
alter table public.stamp_events enable row level security;
alter table public.point_ledger enable row level security;
alter table public.loyalty_redemptions enable row level security;

-- Stamp cards: public read (so customers can see what's offered), org members write.
drop policy if exists "stamp_cards_public_read" on public.stamp_cards;
create policy "stamp_cards_public_read" on public.stamp_cards for select using (true);

drop policy if exists "stamp_cards_member_write" on public.stamp_cards;
create policy "stamp_cards_member_write" on public.stamp_cards for all
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = stamp_cards.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.organization_id = stamp_cards.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ));

-- Stamp events: public read so the customer can see their stamp count via service
-- queries (writes always go through service role).
drop policy if exists "stamp_events_public_read" on public.stamp_events;
create policy "stamp_events_public_read" on public.stamp_events for select using (true);

drop policy if exists "point_ledger_public_read" on public.point_ledger;
create policy "point_ledger_public_read" on public.point_ledger for select using (true);

drop policy if exists "loyalty_redemptions_public_read" on public.loyalty_redemptions;
create policy "loyalty_redemptions_public_read" on public.loyalty_redemptions for select using (true);

commit;
