-- City Wallet — Phase 1: Multi-location organizations + approval workflow
-- Run AFTER db/schema.sql.
--
-- This migration:
--   1. Creates organizations + memberships + rule_approvals.
--   2. Renames `merchants` to `locations` and adds `organization_id`.
--   3. Renames `merchant_id` → `location_id` on items/offer_rules/offers.
--   4. Adds offer_rules.status (draft/pending/approved/rejected).
--   5. Adds offers.granted_to_session_id (for loyalty point spend in Phase 2).
--   6. Backfills: every existing merchant becomes a single-location org with
--      its previous owner as the org owner.
--   7. Rewrites RLS to scope on memberships.
--   8. Replaces merchants_nearby() with locations_nearby() (same shape +
--      organization_id).

begin;

-- ----------------------------------------------------------------------------
-- 1. Organizations
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- Stripe Connect (filled in Phase 3; nullable until then)
  stripe_account_id text unique,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  stripe_details_submitted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists organizations_owner_idx on public.organizations(owner_user_id);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);
create index if not exists memberships_org_idx on public.memberships(organization_id);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- ----------------------------------------------------------------------------
-- 2. Rename merchants → locations (only if not already renamed)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'merchants')
     and not exists (select 1 from information_schema.tables
                     where table_schema = 'public' and table_name = 'locations')
  then
    execute 'alter table public.merchants rename to locations';
  end if;
end $$;

-- Ensure organization_id column exists on locations
alter table public.locations
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- 3. Backfill: one organization + one membership per existing location row
--    that doesn't have an org yet.
insert into public.organizations (name, owner_user_id)
select coalesce(l.name, 'My Business'), l.owner_user_id
from public.locations l
where l.organization_id is null;

update public.locations l
set organization_id = o.id
from public.organizations o
where l.organization_id is null
  and o.owner_user_id = l.owner_user_id
  and o.name = coalesce(l.name, 'My Business');

insert into public.memberships (organization_id, user_id, role)
select o.id, o.owner_user_id, 'owner'
from public.organizations o
on conflict (organization_id, user_id) do nothing;

-- Make organization_id required from here on
alter table public.locations alter column organization_id set not null;

-- The legacy owner_user_id column on locations is now redundant (org has owner)
-- but we keep it for cheap "is this user a manager?" predicates if you want.
-- New code should not rely on it.

create index if not exists locations_org_idx on public.locations(organization_id);
create index if not exists locations_lat_lng_idx on public.locations(lat, lng);
drop index if exists merchants_owner_idx;
drop index if exists merchants_lat_lng_idx;

-- ----------------------------------------------------------------------------
-- 4. Rename merchant_id → location_id on dependent tables
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='items' and column_name='merchant_id')
  then
    execute 'alter table public.items rename column merchant_id to location_id';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='offer_rules' and column_name='merchant_id')
  then
    execute 'alter table public.offer_rules rename column merchant_id to location_id';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='offers' and column_name='merchant_id')
  then
    execute 'alter table public.offers rename column merchant_id to location_id';
  end if;
end $$;

drop index if exists items_merchant_idx;
drop index if exists offer_rules_merchant_idx;
drop index if exists offers_merchant_idx;
create index if not exists items_location_idx on public.items(location_id);
create index if not exists offer_rules_location_idx on public.offer_rules(location_id);
create index if not exists offers_location_idx on public.offers(location_id);

-- ----------------------------------------------------------------------------
-- 5. New columns
-- ----------------------------------------------------------------------------
alter table public.offer_rules
  add column if not exists status text not null default 'approved'
    check (status in ('draft','pending','approved','rejected'));
-- (existing rules default to 'approved' so they keep generating — new ones from
-- the UI will start as draft/pending.)

alter table public.offers
  add column if not exists granted_to_session_id text;
create index if not exists offers_granted_idx on public.offers(granted_to_session_id);

-- Allow Stripe-driven redemptions in Phase 3
alter table public.redemptions
  drop constraint if exists redemptions_method_check;
alter table public.redemptions
  add constraint redemptions_method_check
  check (method in ('code','qr','stripe'));

-- Make rule_id nullable on offers so loyalty-granted offers (Phase 2) can
-- exist without an originating rule.
alter table public.offers
  alter column rule_id drop not null;

-- ----------------------------------------------------------------------------
-- 6. Rule approvals queue
-- ----------------------------------------------------------------------------
create table if not exists public.rule_approvals (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.offer_rules(id) on delete cascade,
  decided_by uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected')),
  note text,
  decided_at timestamptz not null default now()
);
create index if not exists rule_approvals_rule_idx on public.rule_approvals(rule_id);

-- ----------------------------------------------------------------------------
-- 7. RLS — drop legacy merchant policies, install membership-scoped policies
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.locations enable row level security;
alter table public.rule_approvals enable row level security;

-- Drop legacy merchant_* policies if they survived the rename
drop policy if exists "merchants_public_read" on public.locations;
drop policy if exists "merchants_owner_insert" on public.locations;
drop policy if exists "merchants_owner_update" on public.locations;
drop policy if exists "merchants_owner_delete" on public.locations;

-- Helper: writeable means manager or owner
-- (Inlined into each policy because Postgres doesn't allow cross-table
-- function references in RLS without security definer wrappers.)

-- Organizations: members can read; only owner can write.
drop policy if exists "organizations_member_read" on public.organizations;
create policy "organizations_member_read" on public.organizations for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = organizations.id and m.user_id = auth.uid()
  ));

drop policy if exists "organizations_owner_insert" on public.organizations;
create policy "organizations_owner_insert" on public.organizations for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists "organizations_owner_update" on public.organizations;
create policy "organizations_owner_update" on public.organizations for update
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Memberships: a user can read memberships of orgs they belong to; only org
-- owners or managers can insert/update.
drop policy if exists "memberships_member_read" on public.memberships;
create policy "memberships_member_read" on public.memberships for select
  using (exists (
    select 1 from public.memberships m2
    where m2.organization_id = memberships.organization_id and m2.user_id = auth.uid()
  ));

drop policy if exists "memberships_admin_write" on public.memberships;
create policy "memberships_admin_write" on public.memberships for all
  using (exists (
    select 1 from public.memberships m2
    where m2.organization_id = memberships.organization_id
      and m2.user_id = auth.uid()
      and m2.role in ('owner','manager')
  ))
  with check (exists (
    select 1 from public.memberships m2
    where m2.organization_id = memberships.organization_id
      and m2.user_id = auth.uid()
      and m2.role in ('owner','manager')
  ));

-- Locations: public read (customer feed), org managers/owners write.
drop policy if exists "locations_public_read" on public.locations;
create policy "locations_public_read" on public.locations for select using (true);

drop policy if exists "locations_admin_write" on public.locations;
create policy "locations_admin_write" on public.locations for all
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = locations.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.organization_id = locations.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ));

-- Items: public read; any member of the org may write (incl. staff).
drop policy if exists "items_owner_write" on public.items;
drop policy if exists "items_member_write" on public.items;
create policy "items_member_write" on public.items for all
  using (exists (
    select 1 from public.locations l
    join public.memberships m on m.organization_id = l.organization_id
    where l.id = items.location_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.locations l
    join public.memberships m on m.organization_id = l.organization_id
    where l.id = items.location_id and m.user_id = auth.uid()
  ));

-- Offer rules: public read; any member can draft/submit; only owner/manager
-- can flip status to approved/rejected (enforced in server actions, not RLS).
drop policy if exists "offer_rules_owner_write" on public.offer_rules;
drop policy if exists "offer_rules_member_write" on public.offer_rules;
create policy "offer_rules_member_write" on public.offer_rules for all
  using (exists (
    select 1 from public.locations l
    join public.memberships m on m.organization_id = l.organization_id
    where l.id = offer_rules.location_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.locations l
    join public.memberships m on m.organization_id = l.organization_id
    where l.id = offer_rules.location_id and m.user_id = auth.uid()
  ));

-- Rule approvals: visible to the org; insert restricted to manager/owner via
-- the server action (RLS just blocks cross-org writes).
drop policy if exists "rule_approvals_member_read" on public.rule_approvals;
create policy "rule_approvals_member_read" on public.rule_approvals for select
  using (exists (
    select 1 from public.offer_rules r
    join public.locations l on l.id = r.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where r.id = rule_approvals.rule_id and m.user_id = auth.uid()
  ));

drop policy if exists "rule_approvals_admin_write" on public.rule_approvals;
create policy "rule_approvals_admin_write" on public.rule_approvals for insert
  with check (exists (
    select 1 from public.offer_rules r
    join public.locations l on l.id = r.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where r.id = rule_approvals.rule_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ));

-- Redemptions: members of the org can read.
drop policy if exists "redemptions_owner_read" on public.redemptions;
drop policy if exists "redemptions_member_read" on public.redemptions;
create policy "redemptions_member_read" on public.redemptions for select
  using (exists (
    select 1 from public.offers o
    join public.locations l on l.id = o.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where o.id = redemptions.offer_id and m.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------------
-- 8. locations_nearby() RPC (replaces merchants_nearby)
-- ----------------------------------------------------------------------------
drop function if exists public.merchants_nearby(double precision, double precision, double precision);

create or replace function public.locations_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision default 5
)
returns table (
  id uuid,
  organization_id uuid,
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
    l.id,
    l.organization_id,
    l.name,
    l.address,
    l.lat,
    l.lng,
    l.slow_hours,
    (
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(user_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(l.lat))
        ))
      )
    ) as distance_km
  from public.locations l
  where l.lat is not null and l.lng is not null
  and (
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(user_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(l.lat))
        ))
      )
    ) <= radius_km
  order by distance_km asc;
$$;

grant execute on function public.locations_nearby(double precision, double precision, double precision) to anon, authenticated;

commit;
