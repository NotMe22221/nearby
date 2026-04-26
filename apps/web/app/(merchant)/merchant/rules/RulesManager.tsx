"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveRuleAction,
  createRuleAction,
  deleteRuleAction,
  rejectRuleAction,
  submitForApprovalAction,
  updateRuleAction,
} from "./actions";
import type { Item, MembershipRole, OfferRule, OfferRuleStatus } from "@/lib/supabase/types";
import Link from "next/link";

type Props = { items: Item[]; rules: OfferRule[]; role: MembershipRole };

export function RulesManager({ items, rules, role }: Props) {
  const eligibleItems = useMemo(
    () => items.filter((i) => i.offer_eligible),
    [items],
  );

  return (
    <div className="space-y-6">
      {eligibleItems.length === 0 ? (
        <div className="card p-6 text-sm">
          You don’t have any items marked as offer-eligible yet.{" "}
          <Link className="text-accent-600 underline" href="/merchant/items">
            Add items
          </Link>{" "}
          first.
        </div>
      ) : (
        <NewRuleForm items={eligibleItems} role={role} />
      )}

      <div className="space-y-3">
        {rules.length === 0 && (
          <div className="card p-6 text-sm text-ink-900/60">
            No rules yet. Create one above.
          </div>
        )}
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            items={eligibleItems}
            role={role}
          />
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OfferRuleStatus }) {
  const styles: Record<OfferRuleStatus, string> = {
    draft: "bg-ink-100 text-ink-900/70",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    approved: "bg-accent-50 text-accent-700 ring-1 ring-accent-200",
    rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function NewRuleForm({ items, role }: { items: Item[]; role: MembershipRole }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [discountCap, setDiscountCap] = useState(15);
  const [maxRedemptions, setMaxRedemptions] = useState(10);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("15:00");
  const [active, setActive] = useState(true);

  const canApprove = role === "owner" || role === "manager";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    selected.forEach((id) => fd.append("item_ids", id));
    start(async () => {
      const r = await createRuleAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setName("");
        setSelected([]);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-base font-semibold">New offer rule</h2>
      <p className="mt-1 text-xs text-ink-900/60">
        {canApprove
          ? "You’re a manager — new rules go straight to approved."
          : "Staff submissions need a manager to approve before they generate offers."}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input
            name="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Afternoon donut push"
            required
          />
        </div>
        <div className="md:col-span-1">
          <label className="label">Eligible items</label>
          <ItemMultiSelect
            items={items}
            value={selected}
            onChange={setSelected}
          />
        </div>
        <div>
          <label className="label">Max discount cap (%)</label>
          <input
            name="discount_cap_pct"
            type="number"
            min="0"
            max="90"
            className="input"
            value={discountCap}
            onChange={(e) => setDiscountCap(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Max redemptions</label>
          <input
            name="max_redemptions"
            type="number"
            min="1"
            className="input"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Window start</label>
          <input
            name="time_window_start"
            type="time"
            className="input"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Window end</label>
          <input
            name="time_window_end"
            type="time"
            className="input"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            name="active"
            id="rule-active"
            type="checkbox"
            className="h-4 w-4"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor="rule-active" className="text-sm">
            Active
          </label>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Creating…" : canApprove ? "Create rule" : "Submit for approval"}
        </button>
      </div>
    </form>
  );
}

function RuleRow({
  rule,
  items,
  role,
}: {
  rule: OfferRule;
  items: Item[];
  role: MembershipRole;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(rule.name);
  const [selected, setSelected] = useState<string[]>(rule.item_ids);
  const [discountCap, setDiscountCap] = useState(rule.discount_cap_pct);
  const [maxRedemptions, setMaxRedemptions] = useState(rule.max_redemptions);
  const [startTime, setStartTime] = useState(rule.time_window_start.slice(0, 5));
  const [endTime, setEndTime] = useState(rule.time_window_end.slice(0, 5));
  const [active, setActive] = useState(rule.active);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  const canApprove = role === "owner" || role === "manager";

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    selected.forEach((id) => fd.append("item_ids", id));
    start(async () => {
      const r = await updateRuleAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    const fd = new FormData();
    fd.set("id", rule.id);
    start(async () => {
      await deleteRuleAction(fd);
    });
  }

  function quickAction(
    action: typeof submitForApprovalAction,
    label: string,
  ) {
    const fd = new FormData();
    fd.set("id", rule.id);
    start(async () => {
      const r = await action(fd);
      if (!r.ok) setError(r.error || `${label} failed.`);
    });
  }

  return (
    <form onSubmit={onSave} className="card p-5">
      <input type="hidden" name="id" value={rule.id} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{rule.name}</span>
          <StatusPill status={rule.status} />
        </div>
        <div className="flex flex-wrap gap-1">
          {rule.status !== "pending" && rule.status !== "approved" && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              onClick={() => quickAction(submitForApprovalAction, "Submit")}
            >
              Submit for approval
            </button>
          )}
          {canApprove && rule.status === "pending" && (
            <>
              <button
                type="button"
                className="btn-ghost text-xs text-accent-700"
                disabled={pending}
                onClick={() => quickAction(approveRuleAction, "Approve")}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn-ghost text-xs text-red-600"
                disabled={pending}
                onClick={() => quickAction(rejectRuleAction, "Reject")}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input
            name="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Eligible items</label>
          <ItemMultiSelect
            items={items}
            value={selected}
            onChange={setSelected}
          />
        </div>
        <div>
          <label className="label">Discount cap (%)</label>
          <input
            name="discount_cap_pct"
            type="number"
            min="0"
            max="90"
            className="input"
            value={discountCap}
            onChange={(e) => setDiscountCap(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Max redemptions</label>
          <input
            name="max_redemptions"
            type="number"
            min="1"
            className="input"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Window start</label>
          <input
            name="time_window_start"
            type="time"
            className="input"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Window end</label>
          <input
            name="time_window_end"
            type="time"
            className="input"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            name="active"
            id={`rule-${rule.id}-active`}
            type="checkbox"
            className="h-4 w-4"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor={`rule-${rule.id}-active`} className="text-sm">
            Active
          </label>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="btn-ghost text-red-600"
          disabled={pending}
          onClick={onDelete}
        >
          Delete
        </button>
        <button className="btn-secondary" disabled={pending}>
          {pending ? "Saving…" : savedTick ? "Saved" : "Save"}
        </button>
      </div>
    </form>
  );
}

function ItemMultiSelect({
  items,
  value,
  onChange,
}: {
  items: Item[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }
  return (
    <div className="flex flex-wrap gap-2 rounded-xl bg-ink-50 p-3 ring-1 ring-ink-200/60">
      {items.length === 0 && (
        <span className="text-sm text-ink-900/60">
          No eligible items available.
        </span>
      )}
      {items.map((item) => {
        const on = value.includes(item.id);
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => toggle(item.id)}
            className={
              on
                ? "rounded-full bg-accent-500 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full bg-white px-3 py-1 text-xs text-ink-900 ring-1 ring-ink-200"
            }
          >
            {item.name}
            <span className="ml-1 opacity-60">≤{item.max_discount_pct}%</span>
          </button>
        );
      })}
    </div>
  );
}
