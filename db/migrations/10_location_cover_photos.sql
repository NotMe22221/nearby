-- Store cover image URL on locations; extend locations_nearby; storage for uploads.

begin;

alter table public.locations
  add column if not exists cover_image_url text;

-- Return type changed (added cover_image_url); must drop first — CREATE OR REPLACE cannot change OUT row type.
drop function if exists public.locations_nearby(double precision, double precision, double precision);

-- locations_nearby: include cover_image_url
create function public.locations_nearby(
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
  cover_image_url text,
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
    l.cover_image_url,
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

-- Public bucket for location photos (run in Supabase; safe if re-run)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'location-photos',
  'location-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read (public bucket)
drop policy if exists "location_photos_public_read" on storage.objects;
create policy "location_photos_public_read" on storage.objects
  for select using (bucket_id = 'location-photos');

-- Logged-in users can upload
drop policy if exists "location_photos_auth_insert" on storage.objects;
create policy "location_photos_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'location-photos');

drop policy if exists "location_photos_auth_update" on storage.objects;
create policy "location_photos_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'location-photos')
  with check (bucket_id = 'location-photos');

drop policy if exists "location_photos_auth_delete" on storage.objects;
create policy "location_photos_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'location-photos');

commit;
