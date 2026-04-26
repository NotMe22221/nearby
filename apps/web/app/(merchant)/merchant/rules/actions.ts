"use server";

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { canManage, getPrimaryLocation } from "@/lib/auth/membership";
import type { OfferRuleStatus } from "@/lib/supabase/types";

async function loadCtx() {
  const lp = await getPrimaryLocation();
  return lp;
}

function parseRuleForm(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const item_ids = formData.getAll("item_ids").map((x) => String(x));
  const discount_cap_pct = Math.max(
    0,
    Math.min(90, Number(formData.get("discount_cap_pct") || 15)),
  );
  const max_redemptions = Math.max(
    1,
    Number(formData.get("max_redemptions") || 10),
  );
  const time_window_start = String(formData.get("time_window_start") || "13:00");
  const time_window_end = String(formData.get("time_window_end") || "15:00");
  const active = formData.get("active") === "on";
  return {
    name,
    item_ids,
    discount_cap_pct,
    max_redemptions,
    time_window_start,
    time_window_end,
    active,
  };
}

export async function createRuleAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const ctx = await loadCtx();
  if (!ctx) return { ok: false, error: "Set up your business profile first." };
  const data = parseRuleForm(formData);
  if (!data.name) return { ok: false, error: "Rule name is required." };
  if (!data.item_ids.length)
    return { ok: false, error: "Select at least one item." };
  if (data.time_window_start >= data.time_window_end)
    return { ok: false, error: "Time window end must be after start." };

  // Managers/owners can create approved rules directly; staff create pending.
  const status: OfferRuleStatus = canManage(ctx.org.role) ? "approved" : "pending";

  const { error } = await supabase.from("offer_rules").insert({
    location_id: ctx.location.id,
    status,
    ...data,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}

export async function updateRuleAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const ctx = await loadCtx();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const data = parseRuleForm(formData);
  if (!data.name) return { ok: false, error: "Rule name is required." };
  if (data.time_window_start >= data.time_window_end)
    return { ok: false, error: "Time window end must be after start." };

  // Editing an existing rule sends it back to pending unless a manager edits.
  const status: OfferRuleStatus = canManage(ctx.org.role) ? "approved" : "pending";

  const { error } = await supabase
    .from("offer_rules")
    .update({ ...data, status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}

export async function deleteRuleAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const { error } = await supabase.from("offer_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}

export async function submitForApprovalAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("offer_rules")
    .update({ status: "pending" as OfferRuleStatus })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}

export async function approveRuleAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const note = String(formData.get("note") || "");
  const ctx = await loadCtx();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.org.role))
    return { ok: false, error: "Only owners or managers can approve." };
  const supabase = createSupabaseServerClient();
  const svc = createSupabaseServiceClient();
  const { error } = await supabase
    .from("offer_rules")
    .update({ status: "approved" as OfferRuleStatus })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await svc.from("rule_approvals").insert({
    rule_id: id,
    decided_by: ctx.org.user.id,
    decision: "approved",
    note: note || null,
  });
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}

export async function rejectRuleAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const note = String(formData.get("note") || "");
  const ctx = await loadCtx();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.org.role))
    return { ok: false, error: "Only owners or managers can reject." };
  const supabase = createSupabaseServerClient();
  const svc = createSupabaseServiceClient();
  const { error } = await supabase
    .from("offer_rules")
    .update({ status: "rejected" as OfferRuleStatus })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await svc.from("rule_approvals").insert({
    rule_id: id,
    decided_by: ctx.org.user.id,
    decision: "rejected",
    note: note || null,
  });
  revalidatePath("/merchant/rules");
  revalidatePath("/merchant/approvals");
  return { ok: true };
}
