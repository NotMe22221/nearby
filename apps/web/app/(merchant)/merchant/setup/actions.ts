"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geo/nominatim";
import {
  canManage,
  ensureOrgContext,
  getPrimaryLocation,
} from "@/lib/auth/membership";
import type { SlowHour } from "@/lib/supabase/types";

export type SetupResult = {
  ok: boolean;
  error?: string;
  geocoded?: { lat: number; lng: number; display_name: string };
};

function parseSlowHours(formData: FormData): SlowHour[] {
  const out: SlowHour[] = [];
  const days = formData.getAll("slow_day").map((x) => Number(x));
  const starts = formData.getAll("slow_start").map((x) => String(x));
  const ends = formData.getAll("slow_end").map((x) => String(x));
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const start = starts[i];
    const end = ends[i];
    if (
      Number.isInteger(day) &&
      day >= 0 &&
      day <= 6 &&
      /^\d{2}:\d{2}$/.test(start) &&
      /^\d{2}:\d{2}$/.test(end) &&
      start < end
    ) {
      out.push({ day, start, end });
    }
  }
  return out;
}

export async function saveBusinessAction(formData: FormData): Promise<SetupResult> {
  const supabase = createSupabaseServerClient();
  const ctx = await ensureOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role))
    return { ok: false, error: "Only owners or managers can edit." };

  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  if (!name) return { ok: false, error: "Business name is required." };
  if (!address) return { ok: false, error: "Address is required." };

  const slow_hours = parseSlowHours(formData);

  const geocoded = await geocodeAddress(address);
  if (!geocoded) {
    return {
      ok: false,
      error:
        "Could not find that address. Try a more specific street + city + state, e.g. '123 Main St, Woodbury, MN'.",
    };
  }

  const existing = ctx.locations[0];

  if (existing) {
    const { error } = await supabase
      .from("locations")
      .update({
        name,
        address,
        lat: geocoded.lat,
        lng: geocoded.lng,
        slow_hours,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("locations").insert({
      organization_id: ctx.organization.id,
      owner_user_id: ctx.user.id,
      name,
      address,
      lat: geocoded.lat,
      lng: geocoded.lng,
      slow_hours,
    });
    if (error) return { ok: false, error: error.message };
  }

  // Keep the org name in sync with the primary location for nice display.
  if (ctx.organization.name === "My Business" || ctx.organization.name === "") {
    await supabase
      .from("organizations")
      .update({ name })
      .eq("id", ctx.organization.id);
  }

  revalidatePath("/merchant/setup");
  revalidatePath("/merchant");
  revalidatePath("/merchant/locations");
  return {
    ok: true,
    geocoded,
  };
}

export async function _ensureLocationForCurrentUser() {
  // Public helper used by other actions (items/rules) so they can fail
  // gracefully when there isn't a location yet.
  const lp = await getPrimaryLocation();
  return lp;
}
