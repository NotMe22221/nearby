"use client";

import { useState, useTransition } from "react";
import {
  createStampCardAction,
  deleteStampCardAction,
  updateStampCardAction,
} from "./actions";
import type { StampCard } from "@/lib/supabase/types";

type Props = { cards: StampCard[]; canEdit: boolean };

export default function LoyaltyManager({ cards, canEdit }: Props) {
  return (
    <div className="space-y-6">
      {canEdit && <NewCardForm />}
      <div className="space-y-3">
        {cards.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            No stamp cards yet. Create one above to start rewarding repeat
            customers.
          </div>
        )}
        {cards.map((c) => (
          <CardRow key={c.id} card={c} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function NewCardForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createStampCardAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else (e.target as HTMLFormElement).reset();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-base font-semibold text-slate-900">
        Add a stamp card
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input
            name="name"
            className="input"
            placeholder="Coffee club"
            required
          />
        </div>
        <div>
          <label className="label">Stamps required</label>
          <input
            name="stamps_required"
            type="number"
            min={1}
            max={50}
            defaultValue={5}
            className="input"
            required
          />
        </div>
        <div>
          <label className="label">Reward</label>
          <input
            name="reward_text"
            className="input"
            placeholder="Free drink"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked />
          Active
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add stamp card"}
        </button>
      </div>
    </form>
  );
}

function CardRow({ card, canEdit }: { card: StampCard; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(card.name);
  const [reward, setReward] = useState(card.reward_text);
  const [stamps, setStamps] = useState(card.stamps_required);
  const [active, setActive] = useState(card.active);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateStampCardAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete stamp card "${card.name}"?`)) return;
    const fd = new FormData();
    fd.set("id", card.id);
    start(async () => {
      await deleteStampCardAction(fd);
    });
  }

  return (
    <form
      onSubmit={onSave}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <input type="hidden" name="id" value={card.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input
            name="name"
            className="input"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Stamps required</label>
          <input
            name="stamps_required"
            type="number"
            min={1}
            max={50}
            className="input"
            value={stamps}
            disabled={!canEdit}
            onChange={(e) => setStamps(Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="label">Reward</label>
          <input
            name="reward_text"
            className="input"
            value={reward}
            disabled={!canEdit}
            onChange={(e) => setReward(e.target.value)}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            name="active"
            checked={active}
            disabled={!canEdit}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {canEdit && (
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
      )}
    </form>
  );
}
