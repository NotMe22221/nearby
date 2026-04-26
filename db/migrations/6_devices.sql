-- City Wallet — Phase 6: Push notifications (device registry)
-- Run AFTER 5_square.sql.

begin;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  customer_session_id text not null,
  expo_push_token text not null unique,
  last_lat double precision,
  last_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists devices_session_idx on public.devices(customer_session_id);
create index if not exists devices_lat_lng_idx on public.devices(last_lat, last_lng);

-- RLS: writes through service role only; we allow public read of (token,
-- session, location) so the Edge Function can fan out (it uses the service
-- role anyway so this policy is mostly for documentation).
alter table public.devices enable row level security;
drop policy if exists "devices_public_read" on public.devices;
create policy "devices_public_read" on public.devices for select using (true);

commit;
