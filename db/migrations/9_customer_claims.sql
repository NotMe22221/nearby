-- Customer offer claims (name, email, phone) for merchant visibility; complements local wallet.
-- Run in Supabase SQL Editor if the app shows: missing table "offer_customer_claims".
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).

begin;

create table if not exists public.offer_customer_claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  name text,
  email text,
  phone text,
  user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists offer_customer_claims_offer_idx
  on public.offer_customer_claims(offer_id);

alter table public.offer_customer_claims enable row level security;

drop policy if exists "offer_customer_claims_member_read" on public.offer_customer_claims;
create policy "offer_customer_claims_member_read" on public.offer_customer_claims
  for select using (
    exists (
      select 1 from public.offers o
      join public.locations l on l.id = o.location_id
      join public.memberships m on m.organization_id = l.organization_id
      where o.id = offer_customer_claims.offer_id
        and m.user_id = auth.uid()
    )
  );

-- Inserts only via RPC (bypasses RLS)

create or replace function public.register_customer_offer_claim(
  p_offer_id uuid,
  p_name text,
  p_email text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_user_id uuid := auth.uid();
begin
  select o.id, o.expires_at, o.redemptions_count, o.max_redemptions
  into v_offer
  from public.offers o
  where o.id = p_offer_id;

  if v_offer is null then
    raise exception 'Offer not found';
  end if;

  if v_offer.expires_at <= now() then
    raise exception 'Offer has expired';
  end if;

  if v_offer.redemptions_count >= v_offer.max_redemptions then
    raise exception 'Offer is fully redeemed';
  end if;

  insert into public.offer_customer_claims (offer_id, name, email, phone, user_id)
  values (
    p_offer_id,
    nullif(trim(p_name), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    v_user_id
  );
end;
$$;

grant execute on function public.register_customer_offer_claim(uuid, text, text, text) to anon;
grant execute on function public.register_customer_offer_claim(uuid, text, text, text) to authenticated;

commit;
