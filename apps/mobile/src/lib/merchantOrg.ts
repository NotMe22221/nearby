import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY = "nearby.merchant.currentOrgId";

export async function setCurrentOrganizationId(orgId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, orgId);
}

/** Use after creating a new org so dashboard and tools target the new business. */
export async function selectNewOrganization(orgId: string): Promise<void> {
  await setCurrentOrganizationId(orgId);
}

/**
 * Resolves which organization the merchant is working in.
 * Remembers a choice in AsyncStorage; falls back to the first membership.
 */
export async function resolveOrganizationId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mems, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  if (error || !mems?.length) return null;

  const valid = new Set(mems.map((m) => m.organization_id));
  const stored = await AsyncStorage.getItem(KEY);
  if (stored && valid.has(stored)) return stored;

  const first = mems[0].organization_id;
  await AsyncStorage.setItem(KEY, first);
  return first;
}

export async function listMerchantOrganizations(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: mems } = await supabase
    .from("memberships")
    .select("organization_id, organizations(name)")
    .eq("user_id", user.id);
  if (!mems?.length) return [];

  return mems.map((m: { organization_id: string; organizations: { name: string } | { name: string }[] | null }) => {
    const org = m.organizations;
    const name =
      org && !Array.isArray(org)
        ? org.name
        : Array.isArray(org) && org[0]
          ? org[0].name
          : "Business";
    return { id: m.organization_id, name };
  });
}
