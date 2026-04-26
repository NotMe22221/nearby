-- City Wallet — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  lat double precision,
  lng double precision,
  -- Array of { day: 0-6 (Sun-Sat), start: 'HH:MM', end: 'HH:MM' }
  slow_hours jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists merchants_owner_idx on public.merchants(owner_user_id);
create index if not exists merchants_lat_lng_idx on public.merchants(lat, lng);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  base_price numeric(10,2) not null default 0,
  offer_eligible boolean not null default true,
  max_discount_pct integer not null default 25 check (max_discount_pct between 0 and 90),
  created_at timestamptz not null default now()
);
create index if not exists items_merchant_idx on public.items(merchant_id);

create table if not exists public.offer_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  item_ids uuid[] not null default '{}',
  discount_cap_pct integer not null default 15 check (discount_cap_pct between 0 and 90),
  max_redemptions integer not null default 10 check (max_redemptions > 0),
  time_window_start time not null,
  time_window_end time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists offer_rules_merchant_idx on public.offer_rules(merchant_id);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  rule_id uuid not null references public.offer_rules(id) on delete cascade,
  generated_text text not null,
  headline text not null default '',
  scarcity_text text not null default '',
  discount_pct integer not null check (discount_pct between 0 and 90),
  items jsonb not null default '[]'::jsonb,
  redemption_code text not null unique,
  max_redemptions integer not null,
  redemptions_count integer not null default 0,
  expires_at timestamptz not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists offers_merchant_idx on public.offers(merchant_id);
create index if not exists offers_rule_idx on public.offers(rule_id);
create index if not exists offers_expires_idx on public.offers(expires_at);
create index if not exists offers_code_idx on public.offers(redemption_code);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  customer_session_id text not null,
  redeemed_at timestamptz not null default now(),
  method text not null check (method in ('code','qr'))
);
create index if not exists redemptions_offer_idx on public.redemptions(offer_id);
create index if not exists redemptions_session_idx on public.redemptions(customer_session_id);

-- ----------------------------------------------------------------------------
-- RPC: nearby merchants via haversine
-- ----------------------------------------------------------------------------
create or replace function public.merchants_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision default 5
)
returns table (
  id uuid,
  name text,
  address text,
  lat double precision,
  lng double precision,
  slow_hours jsonb,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.name,
    m.address,
    m.lat,
    m.lng,
    m.slow_hours,
    (
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(user_lat)) * cos(radians(m.lat)) *
          cos(radians(m.lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(m.lat))
        ))
      )
    ) as distance_km
  from public.merchants m
  where m.lat is not null and m.lng is not null
  and (
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(user_lat)) * cos(radians(m.lat)) *
          cos(radians(m.lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(m.lat))
        ))
      )
    ) <= radius_km
  order by distance_km asc;
$$;

grant execute on function public.merchants_nearby(double precision, double precision, double precision) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.merchants enable row level security;
alter table public.items enable row level security;
alter table public.offer_rules enable row level security;
alter table public.offers enable row level security;
alter table public.redemptions enable row level security;

-- Merchants: owner can read/write their own row; everyone (anon + auth) can read for the offer feed
drop policy if exists "merchants_public_read" on public.merchants;
create policy "merchants_public_read" on public.merchants for select using (true);

drop policy if exists "merchants_owner_insert" on public.merchants;
create policy "merchants_owner_insert" on public.merchants for insert with check (auth.uid() = owner_user_id);

drop policy if exists "merchants_owner_update" on public.merchants;
create policy "merchants_owner_update" on public.merchants for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "merchants_owner_delete" on public.merchants;
create policy "merchants_owner_delete" on public.merchants for delete using (auth.uid() = owner_user_id);

-- Items: public read (so customer can see item names in offers), owner writes
drop policy if exists "items_public_read" on public.items;
create policy "items_public_read" on public.items for select using (true);

drop policy if exists "items_owner_write" on public.items;
create policy "items_owner_write" on public.items for all
  using (exists (select 1 from public.merchants m where m.id = items.merchant_id and m.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.merchants m where m.id = items.merchant_id and m.owner_user_id = auth.uid()));

-- Offer rules: public read (needed for nearby endpoint), owner writes
drop policy if exists "offer_rules_public_read" on public.offer_rules;
create policy "offer_rules_public_read" on public.offer_rules for select using (true);

drop policy if exists "offer_rules_owner_write" on public.offer_rules;
create policy "offer_rules_owner_write" on public.offer_rules for all
  using (exists (select 1 from public.merchants m where m.id = offer_rules.merchant_id and m.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.merchants m where m.id = offer_rules.merchant_id and m.owner_user_id = auth.uid()));

-- Offers: public read; writes go through service role from the API
drop policy if exists "offers_public_read" on public.offers;
create policy "offers_public_read" on public.offers for select using (true);

-- Redemptions: only the owner of the related merchant can read; writes via service role
drop policy if exists "redemptions_owner_read" on public.redemptions;
create policy "redemptions_owner_read" on public.redemptions for select
  using (exists (
    select 1 from public.offers o
    join public.merchants m on m.id = o.merchant_id
    where o.id = redemptions.offer_id and m.owner_user_id = auth.uid()
  ));
