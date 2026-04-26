"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { canManage, ensureOrgContext } from "@/lib/auth/membership";

export async function linkItemAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };
  if (!canManage(ctx.role)) return { ok: false, error: "Forbidden" };
  const item_id = String(formData.get("item_id") || "");
  const square_catalog_object_id = String(
    formData.get("square_catalog_object_id") || "",
  ).trim();
  const square_variation_id =
    String(formData.get("square_variation_id") || "").trim() || null;
  if (!item_id || !square_catalog_object_id) {
    return { ok: false, error: "item_id and square_catalog_object_id required" };
  }
  const svc = createSupabaseServiceClient();

  // Replace any existing link for this item.
  await svc.from("square_item_links").delete().eq("item_id", item_id);
  const { error } = await svc.from("square_item_links").insert({
    item_id,
    square_catalog_object_id,
    square_variation_id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/pos");
  return { ok: true };
}

export async function unlinkItemAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };
  if (!canManage(ctx.role)) return { ok: false, error: "Forbidden" };
  const item_id = String(formData.get("item_id") || "");
  if (!item_id) return { ok: false, error: "item_id required" };
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("square_item_links")
    .delete()
    .eq("item_id", item_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/pos");
  return { ok: true };
}
