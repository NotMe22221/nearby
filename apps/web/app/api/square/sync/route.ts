import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { canManage, ensureOrgContext } from "@/lib/auth/membership";
import { squareApiBaseUrl, squareConfigured } from "@/lib/square/client";
import type { SquareConnection } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export type SquareCatalogObject = {
  id: string;
  name: string;
  description: string | null;
  variations: Array<{ id: string; name: string; price: number | null }>;
};

export async function GET() {
  return runSync();
}

export async function POST() {
  return runSync();
}

async function runSync() {
  if (!squareConfigured()) {
    return NextResponse.json(
      { error: "Square not configured" },
      { status: 503 },
    );
  }
  const auth = createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const ctx = await ensureOrgContext();
  if (!ctx) return NextResponse.json({ error: "No org" }, { status: 400 });
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createSupabaseServiceClient();
  const { data: conn } = await svc
    .from("square_connections")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const connection = conn as SquareConnection | null;
  if (!connection) {
    return NextResponse.json(
      { error: "Square is not connected for this org." },
      { status: 400 },
    );
  }

  // Search the catalog for ITEM objects.
  const searchRes = await fetch(
    `${squareApiBaseUrl()}/v2/catalog/list?types=ITEM`,
    {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Square-Version": "2024-09-19",
      },
    },
  );
  if (!searchRes.ok) {
    const text = await searchRes.text();
    return NextResponse.json(
      { error: `Square catalog list failed: ${text.slice(0, 120)}` },
      { status: 502 },
    );
  }
  const json = (await searchRes.json()) as {
    objects?: Array<{
      id: string;
      type: string;
      item_data?: {
        name?: string;
        description?: string;
        variations?: Array<{
          id: string;
          item_variation_data?: {
            name?: string;
            price_money?: { amount?: number };
          };
        }>;
      };
    }>;
  };

  const items: SquareCatalogObject[] = (json.objects ?? [])
    .filter((o) => o.type === "ITEM" && o.item_data?.name)
    .map((o) => ({
      id: o.id,
      name: o.item_data?.name ?? "",
      description: o.item_data?.description ?? null,
      variations: (o.item_data?.variations ?? []).map((v) => ({
        id: v.id,
        name: v.item_variation_data?.name ?? "",
        price:
          v.item_variation_data?.price_money?.amount != null
            ? Number(v.item_variation_data.price_money.amount) / 100
            : null,
      })),
    }));

  return NextResponse.json({ items, count: items.length });
}
