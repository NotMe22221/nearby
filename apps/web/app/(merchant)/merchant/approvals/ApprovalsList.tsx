"use client";

import { useState, useTransition } from "react";
import {
  approveRuleAction,
  rejectRuleAction,
} from "../rules/actions";
import type { Item, Location, OfferRule, RuleApproval } from "@/lib/supabase/types";

type Props = {
  rules: OfferRule[];
  items: Map<string, Item>;
  locations: Map<string, Location>;
  history: RuleApproval[];
  canApprove: boolean;
};

export function ApprovalsList({
  rules,
  items,
  locations,
  history,
  canApprove,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {rules.length === 0 && (
          <div className="card p-6 text-sm text-ink-900/60">
            Nothing pending right now.
          </div>
        )}
        {rules.map((rule) => (
          <RuleApprovalRow
            key={rule.id}
            rule={rule}
            items={items}
            locations={locations}
            canApprove={canApprove}
          />
        ))}
      </div>

      <section>
        <h2 className="text-base font-semibold">Recent decisions</h2>
        <div className="card mt-2 divide-y divide-ink-200/60">
          {history.length === 0 && (
            <div className="p-4 text-sm text-ink-900/60">No decisions yet.</div>
          )}
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-start justify-between gap-3 p-4 text-sm"
            >
              <div>
                <span
                  className={
                    h.decision === "approved"
                      ? "rounded-full bg-accent-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-700"
                      : "rounded-full bg-red-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-700"
                  }
                >
                  {h.decision}
                </span>
                <span className="ml-2 text-ink-900/80">
                  rule {h.rule_id.slice(0, 8)}…
                </span>
                {h.note && (
                  <p className="mt-1 text-xs text-ink-900/70">“{h.note}”</p>
                )}
              </div>
              <span className="text-xs text-ink-900/60">
                {new Date(h.decided_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RuleApprovalRow({
  rule,
  items,
  locations,
  canApprove,
}: {
  rule: OfferRule;
  items: Map<string, Item>;
  locations: Map<string, Location>;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ruleItems = rule.item_ids
    .map((id) => items.get(id))
    .filter((x): x is Item => Boolean(x));
  const loc = locations.get(rule.location_id);

  function decide(action: typeof approveRuleAction, label: string) {
    const fd = new FormData();
    fd.set("id", rule.id);
    fd.set("note", note);
    start(async () => {
      const r = await action(fd);
      if (!r.ok) setError(r.error || `${label} failed.`);
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{rule.name}</div>
          <div className="text-xs text-ink-900/60">
            {loc?.name ?? "Unknown location"} · {rule.discount_cap_pct}% cap ·{" "}
            {rule.max_redemptions} redemptions max
          </div>
        </div>
        <span
          className={
            rule.status === "pending"
              ? "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700"
              : "rounded-full bg-red-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-700"
          }
        >
          {rule.status}
        </span>
      </div>
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-ink-900/60">Items</div>
        <ul className="mt-1 flex flex-wrap gap-1 text-xs">
          {ruleItems.map((i) => (
            <li
              key={i.id}
              className="rounded-full bg-ink-50 px-2 py-0.5 text-ink-900/80"
            >
              {i.name} (≤{i.max_discount_pct}%)
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink-900/70 sm:grid-cols-4">
        <span>Window {rule.time_window_start.slice(0, 5)}–{rule.time_window_end.slice(0, 5)}</span>
        <span>{rule.active ? "Active" : "Inactive"}</span>
      </div>
      {canApprove && (
        <div className="mt-4 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional decision note"
            className="input min-h-[64px]"
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-red-600"
              disabled={pending}
              onClick={() => decide(rejectRuleAction, "Reject")}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => decide(approveRuleAction, "Approve")}
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
