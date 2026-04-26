"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canManage, ensureOrgContext } from "@/lib/auth/membership";
import { geocodeAddress } from "@/lib/geo/nominatim";
import type { SlowHour } from "@/lib/supabase/types";

function parseSlowHoursFromString(raw: string): SlowHour[] {
  // Accepts a JSON array string from a hidden input.
  try {
    const parsed = JSON.parse(raw) as SlowHour[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) =>
        Number.isInteger(s.day) &&
        s.day >= 0 &&
        s.day <= 6 &&
        /^\d{2}:\d{2}$/.test(s.start) &&
        /^\d{2}:\d{2}$/.test(s.end) &&
        s.start < s.end,
    );
  } catch {
    return [];
  }
}

export async function createLocationAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can add locations." };

  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const slow = parseSlowHoursFromString(String(formData.get("slow_hours") || "[]"));

  if (!name) return { ok: false, error: "Name required." };
  if (!address) return { ok: false, error: "Address required." };

  const geocoded = await geocodeAddress(address);
  if (!geocoded) return { ok: false, error: "Could not geocode address." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("locations").insert({
    organization_id: ctx.organization.id,
    owner_user_id: ctx.user.id,
    name,
    address,
    lat: geocoded.lat,
    lng: geocoded.lng,
    slow_hours: slow,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/locations");
  revalidatePath("/merchant");
  return { ok: true };
}

export async function updateLocationAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can edit locations." };

  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const slow = parseSlowHoursFromString(String(formData.get("slow_hours") || "[]"));

  if (!id || !name || !address)
    return { ok: false, error: "Missing fields." };

  // Re-geocode every save so the lat/lng stays current.
  const geocoded = await geocodeAddress(address);
  if (!geocoded) return { ok: false, error: "Could not geocode address." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("locations")
    .update({
      name,
      address,
      lat: geocoded.lat,
      lng: geocoded.lng,
      slow_hours: slow,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/locations");
  revalidatePath("/merchant");
  return { ok: true };
}

export async function deleteLocationAction(formData: FormData) {
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners/managers can delete locations." };

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/locations");
  return { ok: true };
}
