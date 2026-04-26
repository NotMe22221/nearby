import { ensureOrgContext } from "@/lib/auth/membership";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Membership } from "@/lib/supabase/types";
import { OrgManager } from "./OrgManager";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const ctx = await ensureOrgContext();
  if (!ctx) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Team</h1>
      </main>
    );
  }

  const svc = createSupabaseServiceClient();
  const { data: members } = await svc
    .from("memberships")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });

  const list = (members as Membership[]) ?? [];

  // Look up emails so the table is human-readable.
  const { data: usersList } = await svc.auth.admin.listUsers();
  const emailById = new Map<string, string>();
  for (const u of usersList?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }
  const memberRows = list.map((m) => ({
    membership: m,
    email: emailById.get(m.user_id) ?? m.user_id,
  }));

  return (
    <main>
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Owners can rename the organization and manage roles. Owners and managers
        can invite teammates.
      </p>
      <div className="mt-6">
        <OrgManager
          orgName={ctx.organization.name}
          ownerUserId={ctx.organization.owner_user_id}
          role={ctx.role}
          members={memberRows}
        />
      </div>
    </main>
  );
}
