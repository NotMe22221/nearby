"use client";

import { useState, useTransition } from "react";
import { saveBusinessAction, type SetupResult } from "./actions";
import { DAY_LABELS } from "@/lib/time/slowHours";
import type { Location, SlowHour } from "@/lib/supabase/types";

type Props = { initial: Location | null };

export function SetupForm({ initial }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [slow, setSlow] = useState<SlowHour[]>(
    initial?.slow_hours?.length
      ? initial.slow_hours
      : [{ day: new Date().getDay(), start: "13:00", end: "15:00" }],
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SetupResult | null>(null);

  function addSlow() {
    setSlow((s) => [
      ...s,
      { day: new Date().getDay(), start: "13:00", end: "15:00" },
    ]);
  }

  function removeSlow(idx: number) {
    setSlow((s) => s.filter((_, i) => i !== idx));
  }

  function updateSlow(idx: number, patch: Partial<SlowHour>) {
    setSlow((s) =>
      s.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveBusinessAction(fd);
      setResult(r);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="card p-5">
        <div>
          <label className="label" htmlFor="name">
            Business name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="address">
            Address
          </label>
          <input
            id="address"
            name="address"
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Woodbury, MN"
            required
          />
          <p className="mt-1 text-xs text-ink-900/60">
            We geocode this address with OpenStreetMap. Include city + state for
            best results.
          </p>
          {initial?.lat != null && initial?.lng != null && (
            <p className="mt-1 text-xs text-ink-900/60">
              Current location: {initial.lat.toFixed(5)}, {initial.lng.toFixed(5)}
            </p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Slow hours</h2>
            <p className="text-xs text-ink-900/60">
              Offers are only generated during these windows.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={addSlow}>
            + Add window
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {slow.length === 0 && (
            <p className="text-sm text-ink-900/60">No slow hours yet.</p>
          )}
          {slow.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <select
                name="slow_day"
                value={row.day}
                onChange={(e) =>
                  updateSlow(idx, { day: Number(e.target.value) })
                }
                className="input"
              >
                {DAY_LABELS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                name="slow_start"
                value={row.start}
                onChange={(e) => updateSlow(idx, { start: e.target.value })}
                className="input"
                required
              />
              <input
                type="time"
                name="slow_end"
                value={row.end}
                onChange={(e) => updateSlow(idx, { end: e.target.value })}
                className="input"
                required
              />
              <button
                type="button"
                className="btn-ghost text-red-600"
                onClick={() => removeSlow(idx)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {result && !result.ok && result.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {result.error}
        </div>
      )}
      {result?.ok && result.geocoded && (
        <div className="rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700 ring-1 ring-accent-100">
          Saved. Pinned to {result.geocoded.lat.toFixed(5)},{" "}
          {result.geocoded.lng.toFixed(5)} ({result.geocoded.display_name}).
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save business profile"}
        </button>
      </div>
    </form>
  );
}
