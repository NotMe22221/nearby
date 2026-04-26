-- City Wallet — Phase 3: Payments via Stripe Connect Express
-- Run AFTER 3_loyalty.sql.

begin;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_session_id text not null,
  stripe_payment_intent_id text not null unique,
  amount integer not null, -- smallest currency unit
  currency text not null default 'usd',
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists payments_offer_idx on public.payments(offer_id);
create index if not exists payments_org_idx on public.payments(organization_id);
create index if not exists payments_session_idx on public.payments(customer_session_id);

-- Backfill the FK from stamp_events.payment_id now that payments exists.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'stamp_events'
      and constraint_name = 'stamp_events_payment_id_fkey'
  ) then
    alter table public.stamp_events
      add constraint stamp_events_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
end $$;

-- RLS
alter table public.payments enable row level security;

drop policy if exists "payments_member_read" on public.payments;
create policy "payments_member_read" on public.payments for select
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = payments.organization_id
      and m.user_id = auth.uid()
  ));

commit;
