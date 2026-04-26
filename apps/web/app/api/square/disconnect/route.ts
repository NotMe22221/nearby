import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { ensureOrgContext, isOwner } from "@/lib/auth/membership";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ctx = await ensureOrgContext();
  if (!ctx) return NextResponse.json({ error: "No org" }, { status: 400 });
  if (!isOwner(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createSupabaseServiceClient();
  await svc
    .from("square_connections")
    .delete()
    .eq("organization_id", ctx.organization.id);
  return NextResponse.json({ ok: true });
}
