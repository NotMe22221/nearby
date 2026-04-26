"use client";

import { useState, useTransition } from "react";
import {
  createLocationAction,
  deleteLocationAction,
  updateLocationAction,
} from "./actions";
import { DAY_LABELS } from "@/lib/time/slowHours";
import type { Location, SlowHour } from "@/lib/supabase/types";

type Props = { locations: Location[]; canEdit: boolean };

export function LocationsManager({ locations, canEdit }: Props) {
  return (
    <div className="space-y-6">
      {canEdit && <NewLocationForm />}
      <div className="space-y-3">
        {locations.length === 0 && (
          <div className="card p-6 text-sm text-ink-900/60">
            No locations yet. Add your first storefront above.
          </div>
        )}
        {locations.map((l) => (
          <LocationRow key={l.id} location={l} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function emptySlow(): SlowHour {
  return { day: new Date().getDay(), start: "13:00", end: "15:00" };
}

function SlowHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: SlowHour[];
  onChange: (next: SlowHour[]) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label">Slow hours</span>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={disabled}
          onClick={() => onChange([...value, emptySlow()])}
        >
          + Add window
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {value.length === 0 && (
          <p className="text-xs text-ink-900/60">No windows configured.</p>
        )}
        {value.map((row, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 gap-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <select
              value={row.day}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  value.map((r, i) =>
                    i === idx ? { ...r, day: Number(e.target.value) } : r,
                  ),
                )
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
              value={row.start}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  value.map((r, i) =>
                    i === idx ? { ...r, start: e.target.value } : r,
                  ),
                )
              }
              className="input"
            />
            <input
              type="time"
              value={row.end}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  value.map((r, i) =>
                    i === idx ? { ...r, end: e.target.value } : r,
                  ),
                )
              }
              className="input"
            />
            <button
              type="button"
              className="btn-ghost text-red-600"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewLocationForm() {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [slow, setSlow] = useState<SlowHour[]>([emptySlow()]);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("slow_hours", JSON.stringify(slow));
    start(async () => {
      const r = await createLocationAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setName("");
        setAddress("");
        setSlow([emptySlow()]);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-base font-semibold">Add a location</h2>
      <div className="mt-3 space-y-3">
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
          <label className="label">Address</label>
          <input
            name="address"
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            placeholder="123 Main St, City, ST"
          />
        </div>
        <SlowHoursEditor value={slow} onChange={setSlow} disabled={pending} />
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add location"}
        </button>
      </div>
    </form>
  );
}

function LocationRow({
  location,
  canEdit,
}: {
  location: Location;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address);
  const [slow, setSlow] = useState<SlowHour[]>(location.slow_hours);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("slow_hours", JSON.stringify(slow));
    start(async () => {
      const r = await updateLocationAction(fd);
      if (!r.ok) setError(r.error || "Failed.");
      else {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete location "${location.name}"?`)) return;
    const fd = new FormData();
    fd.set("id", location.id);
    start(async () => {
      await deleteLocationAction(fd);
    });
  }

  return (
    <form onSubmit={onSave} className="card p-5">
      <input type="hidden" name="id" value={location.id} />
      <div className="space-y-3">
        <div>
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
          <label className="label">Address</label>
          <input
            name="address"
            className="input"
            value={address}
            disabled={!canEdit}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
          {location.lat != null && location.lng != null && (
            <p className="mt-1 text-xs text-ink-900/60">
              Pinned at {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </p>
          )}
        </div>
        <SlowHoursEditor
          value={slow}
          onChange={setSlow}
          disabled={!canEdit || pending}
        />
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
