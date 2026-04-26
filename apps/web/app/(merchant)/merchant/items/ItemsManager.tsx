"use client";

import { useState, useTransition } from "react";
import {
  createItemAction,
  deleteItemAction,
  updateItemAction,
} from "./actions";
import type { Item } from "@/lib/supabase/types";

export function ItemsManager({ items }: { items: Item[] }) {
  return (
    <div className="space-y-6">
      <NewItemForm />
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="card p-6 text-sm text-ink-900/60">
            No items yet. Add your first one above.
          </div>
        )}
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function NewItemForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [maxPct, setMaxPct] = useState(25);
  const [eligible, setEligible] = useState(true);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createItemAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setName("");
        setPrice("");
        setMaxPct(25);
        setEligible(true);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-base font-semibold">Add an item</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
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
          <label className="label">Base price ($)</label>
          <input
            name="base_price"
            type="number"
            min="0"
            step="0.01"
            className="input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Max discount %</label>
          <input
            name="max_discount_pct"
            type="number"
            min="0"
            max="90"
            className="input"
            value={maxPct}
            onChange={(e) => setMaxPct(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              name="offer_eligible"
              type="checkbox"
              className="h-4 w-4"
              checked={eligible}
              onChange={(e) => setEligible(e.target.checked)}
            />
            Eligible
          </label>
        </div>
        <div className="flex items-end">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      )}
    </form>
  );
}

function ItemRow({ item }: { item: Item }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.base_price));
  const [maxPct, setMaxPct] = useState(item.max_discount_pct);
  const [eligible, setEligible] = useState(item.offer_eligible);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateItemAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete ${item.name}?`)) return;
    const fd = new FormData();
    fd.set("id", item.id);
    start(async () => {
      await deleteItemAction(fd);
    });
  }

  return (
    <form
      onSubmit={onSave}
      className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto]"
    >
      <input type="hidden" name="id" value={item.id} />
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
        <label className="label">Price</label>
        <input
          name="base_price"
          type="number"
          min="0"
          step="0.01"
          className="input"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Max %</label>
        <input
          name="max_discount_pct"
          type="number"
          min="0"
          max="90"
          className="input"
          value={maxPct}
          onChange={(e) => setMaxPct(Number(e.target.value))}
        />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            name="offer_eligible"
            type="checkbox"
            className="h-4 w-4"
            checked={eligible}
            onChange={(e) => setEligible(e.target.checked)}
          />
          Eligible
        </label>
      </div>
      <div className="flex items-end">
        <button className="btn-secondary" disabled={pending}>
          {pending ? "Saving…" : savedTick ? "Saved" : "Save"}
        </button>
      </div>
      <div className="flex items-end">
        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost text-red-600"
          disabled={pending}
        >
          Delete
        </button>
      </div>
      {error && (
        <p className="col-span-full text-sm text-red-700">{error}</p>
      )}
    </form>
  );
}
