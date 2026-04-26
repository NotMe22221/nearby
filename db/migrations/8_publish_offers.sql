-- Migration 8: Allow merchants to publish offers directly and auto-generate from rules
-- Also adds INSERT policy on offers for authenticated org members.

-- Allow org members to insert offers for their locations
DROP POLICY IF EXISTS "offers_member_insert" ON public.offers;
CREATE POLICY "offers_member_insert" ON public.offers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.memberships m ON m.organization_id = l.organization_id
    WHERE l.id = offers.location_id AND m.user_id = auth.uid()
  ));

-- Allow org members to update their own offers
DROP POLICY IF EXISTS "offers_member_update" ON public.offers;
CREATE POLICY "offers_member_update" ON public.offers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.memberships m ON m.organization_id = l.organization_id
    WHERE l.id = offers.location_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.memberships m ON m.organization_id = l.organization_id
    WHERE l.id = offers.location_id AND m.user_id = auth.uid()
  ));

-- RPC: Publish an offer (from a rule or standalone)
CREATE OR REPLACE FUNCTION public.publish_offer(
  p_location_id uuid,
  p_headline text,
  p_discount_pct integer,
  p_max_redemptions integer DEFAULT 100,
  p_expires_hours integer DEFAULT 24,
  p_rule_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer_id uuid;
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the user is a member of the org that owns this location
  IF NOT EXISTS (
    SELECT 1 FROM locations l
    JOIN memberships m ON m.organization_id = l.organization_id
    WHERE l.id = p_location_id AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this location';
  END IF;

  -- Generate a unique redemption code
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO offers (
    location_id, rule_id, headline, generated_text, discount_pct,
    redemption_code, max_redemptions, expires_at
  ) VALUES (
    p_location_id, p_rule_id, p_headline, p_headline, p_discount_pct,
    v_code, p_max_redemptions,
    now() + (p_expires_hours || ' hours')::interval
  )
  RETURNING id INTO v_offer_id;

  RETURN json_build_object(
    'offer_id', v_offer_id,
    'redemption_code', v_code
  );
END;
$$;

-- RPC: Auto-generate an offer from an approved rule
CREATE OR REPLACE FUNCTION public.generate_offer_from_rule(p_rule_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rule record;
  v_offer_id uuid;
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.*, l.organization_id
  INTO v_rule
  FROM offer_rules r
  JOIN locations l ON l.id = r.location_id
  WHERE r.id = p_rule_id;

  IF v_rule IS NULL THEN
    RAISE EXCEPTION 'Rule not found';
  END IF;

  -- Verify membership
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = v_rule.organization_id AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO offers (
    location_id, rule_id, headline, generated_text, discount_pct,
    redemption_code, max_redemptions, expires_at
  ) VALUES (
    v_rule.location_id, p_rule_id,
    v_rule.name || ' - ' || v_rule.discount_cap_pct || '% off',
    v_rule.name || ' - ' || v_rule.discount_cap_pct || '% off',
    v_rule.discount_cap_pct,
    v_code, v_rule.max_redemptions,
    now() + interval '24 hours'
  )
  RETURNING id INTO v_offer_id;

  RETURN json_build_object(
    'offer_id', v_offer_id,
    'redemption_code', v_code
  );
END;
$$;

-- RPC: Redeem an offer by code (mobile-friendly, uses Supabase auth directly)
CREATE OR REPLACE FUNCTION public.redeem_offer_by_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer record;
  v_org_id uuid;
  v_session_id text;
  v_existing_id uuid;
  v_redemption_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the offer by code (case-insensitive)
  SELECT o.*, l.organization_id
  INTO v_offer
  FROM offers o
  JOIN locations l ON l.id = o.location_id
  WHERE upper(o.redemption_code) = upper(trim(p_code));

  IF v_offer IS NULL THEN
    RAISE EXCEPTION 'Code not found';
  END IF;

  -- Verify the merchant is a member of the org that owns this offer
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = v_offer.organization_id AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'This code is for a different merchant';
  END IF;

  IF v_offer.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer has expired';
  END IF;

  IF v_offer.redemptions_count >= v_offer.max_redemptions THEN
    RAISE EXCEPTION 'All redemptions have been used';
  END IF;

  v_session_id := 'manual:' || v_user_id::text || ':' || extract(epoch from now())::text;

  -- Insert redemption
  INSERT INTO redemptions (offer_id, customer_session_id, method)
  VALUES (v_offer.id, v_session_id, 'code')
  RETURNING id INTO v_redemption_id;

  -- Increment count
  UPDATE offers SET redemptions_count = redemptions_count + 1 WHERE id = v_offer.id;

  RETURN json_build_object(
    'ok', true,
    'offer_id', v_offer.id,
    'discount_pct', v_offer.discount_pct,
    'redemptions_count', v_offer.redemptions_count + 1,
    'max_redemptions', v_offer.max_redemptions
  );
END;
$$;

-- RPC: Geocode-update a location's lat/lng
CREATE OR REPLACE FUNCTION public.update_location_coords(
  p_location_id uuid,
  p_lat double precision,
  p_lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM locations l
    JOIN memberships m ON m.organization_id = l.organization_id
    WHERE l.id = p_location_id AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE locations SET lat = p_lat, lng = p_lng WHERE id = p_location_id;
END;
$$;
