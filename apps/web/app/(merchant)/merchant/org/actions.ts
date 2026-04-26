"use server";

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { canManage, ensureOrgContext, isOwner } from "@/lib/auth/membership";
import type { MembershipRole } from "@/lib/supabase/types";

export async function renameOrgAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!isOwner(ctx.role))
    return { ok: false, error: "Only the org owner can rename." };
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, error: "Name required." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/org");
  revalidatePath("/merchant");
  return { ok: true };
}

export async function inviteMemberAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners or managers can invite." };

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") || "staff") as MembershipRole;
  if (!email) return { ok: false, error: "Email required." };
  if (!["owner", "manager", "staff"].includes(role))
    return { ok: false, error: "Invalid role." };

  const svc = createSupabaseServiceClient();

  // Look up a user with this email; only existing users can be added.
  // (A real product would email an invite link.)
  const { data: list, error: listErr } = await svc.auth.admin.listUsers();
  if (listErr) return { ok: false, error: listErr.message };
  const target = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!target) {
    return {
      ok: false,
      error:
        "No Nearby user with that email yet. Have them sign up first, then invite them.",
    };
  }

  const { error } = await svc.from("memberships").upsert(
    {
      organization_id: ctx.organization.id,
      user_id: target.id,
      role,
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/org");
  return { ok: true };
}

export async function updateMemberRoleAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!isOwner(ctx.role))
    return { ok: false, error: "Only the owner can change roles." };
  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "staff") as MembershipRole;
  if (!id) return { ok: false, error: "Missing id." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("memberships")
    .update({ role })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/org");
  return { ok: true };
}

export async function removeMemberAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners or managers can remove members." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("memberships").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/org");
  return { ok: true };
}
