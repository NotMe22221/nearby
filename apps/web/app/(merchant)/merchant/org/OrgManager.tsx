"use client";

import { useState, useTransition } from "react";
import {
  inviteMemberAction,
  removeMemberAction,
  renameOrgAction,
  updateMemberRoleAction,
} from "./actions";
import type { Membership, MembershipRole } from "@/lib/supabase/types";

type MemberRow = { membership: Membership; email: string };

type Props = {
  orgName: string;
  ownerUserId: string;
  role: MembershipRole;
  members: MemberRow[];
};

export function OrgManager({ orgName, ownerUserId, role, members }: Props) {
  const isOwner = role === "owner";
  const canManage = isOwner || role === "manager";
  return (
    <div className="space-y-6">
      <RenameForm initial={orgName} disabled={!isOwner} />
      {canManage && <InviteForm />}
      <div className="card divide-y divide-ink-200/60">
        {members.length === 0 && (
          <div className="p-5 text-sm text-ink-900/60">No members yet.</div>
        )}
        {members.map((m) => (
          <MemberRowView
            key={m.membership.id}
            row={m}
            ownerUserId={ownerUserId}
            isOwner={isOwner}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}

function RenameForm({ initial, disabled }: { initial: string; disabled?: boolean }) {
  const [name, setName] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await renameOrgAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      }
    });
  }
  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-base font-semibold">Organization name</h2>
      <div className="mt-3 flex gap-3">
        <input
          name="name"
          className="input"
          value={name}
          disabled={disabled || pending}
          onChange={(e) => setName(e.target.value)}
        />
        {!disabled && (
          <button className="btn-secondary" disabled={pending}>
            {savedTick ? "Saved" : "Save"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </form>
  );
}

function InviteForm() {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("staff");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await inviteMemberAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setEmail("");
        setOk(`Added ${email} as ${role}.`);
      }
    });
  }
  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-base font-semibold">Invite teammate</h2>
      <p className="mt-1 text-xs text-ink-900/60">
        Teammate must already have a Nearby account (sign up at /merchant/login).
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <input
          name="email"
          type="email"
          className="input"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select
          name="role"
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as MembershipRole)}
        >
          <option value="staff">staff</option>
          <option value="manager">manager</option>
          <option value="owner">owner</option>
        </select>
        <button className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {okMsg && <p className="mt-2 text-sm text-accent-700">{okMsg}</p>}
    </form>
  );
}

function MemberRowView({
  row,
  ownerUserId,
  isOwner,
  canManage,
}: {
  row: MemberRow;
  ownerUserId: string;
  isOwner: boolean;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState<MembershipRole>(row.membership.role);
  const isOwnerRow = row.membership.user_id === ownerUserId;

  function changeRole(next: MembershipRole) {
    setRole(next);
    const fd = new FormData();
    fd.set("id", row.membership.id);
    fd.set("role", next);
    start(async () => {
      await updateMemberRoleAction(fd);
    });
  }

  function remove() {
    if (!confirm(`Remove ${row.email}?`)) return;
    const fd = new FormData();
    fd.set("id", row.membership.id);
    start(async () => {
      await removeMemberAction(fd);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div>
        <div className="text-sm font-medium">{row.email}</div>
        <div className="text-xs text-ink-900/60">
          since {new Date(row.membership.created_at).toLocaleDateString()}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isOwner && !isOwnerRow ? (
          <select
            value={role}
            disabled={pending}
            onChange={(e) => changeRole(e.target.value as MembershipRole)}
            className="input py-1 text-xs"
          >
            <option value="staff">staff</option>
            <option value="manager">manager</option>
            <option value="owner">owner</option>
          </select>
        ) : (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-900/60">
            {role}
          </span>
        )}
        {canManage && !isOwnerRow && (
          <button
            type="button"
            className="btn-ghost text-xs text-red-600"
            disabled={pending}
            onClick={remove}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
