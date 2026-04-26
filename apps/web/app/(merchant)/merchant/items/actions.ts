"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryLocation } from "@/lib/auth/membership";

async function requireLocationId(): Promise<string | null> {
  const lp = await getPrimaryLocation();
  return lp?.location.id ?? null;
}

export async function createItemAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const location_id = await requireLocationId();
  if (!location_id)
    return { ok: false, error: "Set up your business profile first." };

  const name = String(formData.get("name") || "").trim();
  const base_price = Number(formData.get("base_price") || 0);
  const max_discount_pct = Math.max(
    0,
    Math.min(90, Number(formData.get("max_discount_pct") || 25)),
  );
  const offer_eligible = formData.get("offer_eligible") === "on";
  if (!name) return { ok: false, error: "Item name is required." };

  const { error } = await supabase.from("items").insert({
    location_id,
    name,
    base_price,
    max_discount_pct,
    offer_eligible,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/items");
  revalidatePath("/merchant/rules");
  return { ok: true };
}

export async function updateItemAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };

  const name = String(formData.get("name") || "").trim();
  const base_price = Number(formData.get("base_price") || 0);
  const max_discount_pct = Math.max(
    0,
    Math.min(90, Number(formData.get("max_discount_pct") || 25)),
  );
  const offer_eligible = formData.get("offer_eligible") === "on";

  const { error } = await supabase
    .from("items")
    .update({ name, base_price, max_discount_pct, offer_eligible })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/items");
  revalidatePath("/merchant/rules");
  return { ok: true };
}

export async function deleteItemAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/items");
  revalidatePath("/merchant/rules");
  return { ok: true };
}
