-- Fix: "infinite recursion detected in policy for relation memberships"
--
-- The original memberships RLS policies query the memberships table from
-- within their own USING/WITH CHECK clauses, causing Postgres to recurse
-- endlessly.  The fix uses SECURITY DEFINER helper functions that bypass
-- RLS when reading membership rows, breaking the cycle.

BEGIN;

-- 1. Helper: org IDs the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT organization_id FROM memberships WHERE user_id = auth.uid(); $$;

-- 2. Helper: org IDs where the current user is owner or manager
CREATE OR REPLACE FUNCTION public.get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT organization_id FROM memberships WHERE user_id = auth.uid() AND role IN ('owner','manager'); $$;

GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_org_ids() TO anon, authenticated;

-- 3. Replace the recursive SELECT policy
DROP POLICY IF EXISTS "memberships_member_read" ON public.memberships;
CREATE POLICY "memberships_member_read" ON public.memberships FOR SELECT
  USING (organization_id IN (SELECT public.get_user_org_ids()));

-- 4. Replace the recursive ALL/write policy
DROP POLICY IF EXISTS "memberships_admin_write" ON public.memberships;
DROP POLICY IF EXISTS "memberships_admin_manage" ON public.memberships;
CREATE POLICY "memberships_admin_manage" ON public.memberships
  FOR ALL
  USING  (organization_id IN (SELECT public.get_user_admin_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.get_user_admin_org_ids()));

-- 5. Allow org owner to bootstrap their very first membership row
DROP POLICY IF EXISTS "memberships_owner_bootstrap" ON public.memberships;
CREATE POLICY "memberships_owner_bootstrap" ON public.memberships FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.owner_user_id = auth.uid()
    )
  );

-- 6. RPC to bootstrap a merchant business (org + membership + location)
--    Bypasses RLS so the very first save always works.
CREATE OR REPLACE FUNCTION public.setup_merchant_business(
  p_name text,
  p_address text,
  p_slow_hours jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_loc_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an org
  SELECT m.organization_id INTO v_org_id
  FROM memberships m WHERE m.user_id = v_user_id LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, owner_user_id)
    VALUES (p_name, v_user_id)
    RETURNING id INTO v_org_id;

    INSERT INTO memberships (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');
  ELSE
    UPDATE organizations SET name = p_name WHERE id = v_org_id;
  END IF;

  -- Upsert first location
  SELECT id INTO v_loc_id
  FROM locations WHERE organization_id = v_org_id
  ORDER BY created_at LIMIT 1;

  IF v_loc_id IS NULL THEN
    INSERT INTO locations (name, address, slow_hours, organization_id, owner_user_id)
    VALUES (p_name, p_address, p_slow_hours, v_org_id, v_user_id)
    RETURNING id INTO v_loc_id;
  ELSE
    UPDATE locations
    SET name = p_name, address = p_address, slow_hours = p_slow_hours
    WHERE id = v_loc_id;
  END IF;

  RETURN json_build_object('org_id', v_org_id, 'location_id', v_loc_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_merchant_business(text, text, jsonb) TO authenticated;

-- 7. RPC to look up a user ID by email (for team invitations)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;

-- 8. RPC to create an additional business (always creates a new org)
CREATE OR REPLACE FUNCTION public.create_new_business(p_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_loc_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (name, owner_user_id)
  VALUES (p_name, v_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  INSERT INTO locations (name, address, slow_hours, organization_id, owner_user_id)
  VALUES (p_name, '', '[]'::jsonb, v_org_id, v_user_id)
  RETURNING id INTO v_loc_id;

  RETURN json_build_object('org_id', v_org_id, 'location_id', v_loc_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_new_business(text) TO authenticated;

COMMIT;
