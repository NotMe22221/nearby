"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canManage, ensureOrgContext } from "@/lib/auth/membership";

export async function createStampCardAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can create stamp cards." };

  const name = String(formData.get("name") || "").trim();
  const stamps_required = Math.max(
    1,
    Math.min(50, Number(formData.get("stamps_required") || 5)),
  );
  const reward_text = String(formData.get("reward_text") || "").trim();
  const active = formData.get("active") === "on";

  if (!name) return { ok: false, error: "Name required." };
  if (!reward_text) return { ok: false, error: "Reward description required." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("stamp_cards").insert({
    organization_id: ctx.organization.id,
    name,
    stamps_required,
    reward_text,
    active,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/loyalty");
  return { ok: true };
}

export async function updateStampCardAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can edit stamp cards." };

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const name = String(formData.get("name") || "").trim();
  const stamps_required = Math.max(
    1,
    Math.min(50, Number(formData.get("stamps_required") || 5)),
  );
  const reward_text = String(formData.get("reward_text") || "").trim();
  const active = formData.get("active") === "on";

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("stamp_cards")
    .update({ name, stamps_required, reward_text, active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/loyalty");
  return { ok: true };
}

export async function deleteStampCardAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can delete stamp cards." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("stamp_cards").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/loyalty");
  return { ok: true };
}
