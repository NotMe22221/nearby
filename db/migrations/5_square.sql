-- City Wallet — Phase 4: Square Sandbox POS sync
-- Run AFTER 4_stripe.sql.

begin;

create table if not exists public.square_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  square_merchant_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  square_location_id text,
  created_at timestamptz not null default now()
);
create index if not exists square_connections_org_idx on public.square_connections(organization_id);

create table if not exists public.square_item_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  square_catalog_object_id text not null,
  square_variation_id text,
  created_at timestamptz not null default now(),
  unique(item_id, square_catalog_object_id)
);
create index if not exists square_item_links_item_idx on public.square_item_links(item_id);

create table if not exists public.pos_redemptions (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.redemptions(id) on delete cascade,
  square_payment_id text,
  square_refund_id text,
  status text not null check (status in ('pending','applied','manual','error')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists pos_redemptions_redemption_idx on public.pos_redemptions(redemption_id);

-- RLS
alter table public.square_connections enable row level security;
alter table public.square_item_links enable row level security;
alter table public.pos_redemptions enable row level security;

drop policy if exists "square_connections_member_read" on public.square_connections;
create policy "square_connections_member_read" on public.square_connections for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = square_connections.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ));
-- (Writes happen via service role only.)

drop policy if exists "square_item_links_member_read" on public.square_item_links;
create policy "square_item_links_member_read" on public.square_item_links for select
  using (exists (
    select 1 from public.items i
    join public.locations l on l.id = i.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where i.id = square_item_links.item_id and m.user_id = auth.uid()
  ));
drop policy if exists "square_item_links_member_write" on public.square_item_links;
create policy "square_item_links_member_write" on public.square_item_links for all
  using (exists (
    select 1 from public.items i
    join public.locations l on l.id = i.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where i.id = square_item_links.item_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ))
  with check (exists (
    select 1 from public.items i
    join public.locations l on l.id = i.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where i.id = square_item_links.item_id
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ));

drop policy if exists "pos_redemptions_member_read" on public.pos_redemptions;
create policy "pos_redemptions_member_read" on public.pos_redemptions for select
  using (exists (
    select 1 from public.redemptions r
    join public.offers o on o.id = r.offer_id
    join public.locations l on l.id = o.location_id
    join public.memberships m on m.organization_id = l.organization_id
    where r.id = pos_redemptions.redemption_id and m.user_id = auth.uid()
  ));

commit;
