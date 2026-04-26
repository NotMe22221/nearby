import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type {
  Location,
  Membership,
  MembershipRole,
  Organization,
} from "@/lib/supabase/types";

export type ActiveOrgContext = {
  user: { id: string; email: string | null };
  organization: Organization;
  role: MembershipRole;
  locations: Location[];
  membership: Membership;
};

/**
 * Resolve the signed-in user's "current" organization. For now we pick the
 * first membership; a real product would let the user switch.
 *
 * Returns null if the user is not signed in or has no memberships.
 */
export async function getActiveOrgContext(): Promise<ActiveOrgContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const membership = (memberships?.[0] as Membership | undefined) ?? null;
  if (!membership) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", membership.organization_id)
    .maybeSingle();
  if (!org) return null;

  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: true });

  return {
    user: { id: user.id, email: user.email ?? null },
    organization: org as Organization,
    role: membership.role,
    locations: (locations as Location[]) ?? [],
    membership,
  };
}

/**
 * Get the org context, creating a fresh organization + owner membership if the
 * user has none. Useful right after sign-up so the merchant can land on /merchant
 * and immediately do something.
 */
export async function ensureOrgContext(
  defaultName = "My Business",
): Promise<ActiveOrgContext | null> {
  const existing = await getActiveOrgContext();
  if (existing) return existing;

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .insert({ name: defaultName, owner_user_id: user.id })
    .select("*")
    .single();
  if (orgErr || !org) return null;

  await svc.from("memberships").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  return getActiveOrgContext();
}

export function canManage(role: MembershipRole): boolean {
  return role === "owner" || role === "manager";
}

export function isOwner(role: MembershipRole): boolean {
  return role === "owner";
}

/**
 * Resolve the merchant user's "primary location" — the first location for the
 * org. Existing single-location flows (items, rules, scanner) use this.
 */
export async function getPrimaryLocation(): Promise<{
  org: ActiveOrgContext;
  location: Location;
} | null> {
  const ctx = await ensureOrgContext();
  if (!ctx) return null;
  const location = ctx.locations[0];
  if (!location) return null;
  return { org: ctx, location };
}
