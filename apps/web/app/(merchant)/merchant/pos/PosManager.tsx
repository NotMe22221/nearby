"use client";

import { useState, useTransition } from "react";
import { linkItemAction, unlinkItemAction } from "./actions";
import type {
  Item,
  PosRedemption,
  SquareConnection,
  SquareItemLink,
} from "@/lib/supabase/types";
import type { SquareCatalogObject } from "@/app/api/square/sync/route";

type Props = {
  connection: SquareConnection | null;
  items: Item[];
  links: SquareItemLink[];
  recent: PosRedemption[];
  configured: boolean;
  canEdit: boolean;
  isOwner: boolean;
};

export default function PosManager({
  connection,
  items,
  links,
  recent,
  configured,
  canEdit,
  isOwner,
}: Props) {
  const [catalog, setCatalog] = useState<SquareCatalogObject[] | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, start] = useTransition();
  const [, force] = useState(0);

  const linkByItem = new Map<string, SquareItemLink>();
  links.forEach((l) => linkByItem.set(l.item_id, l));

  async function syncCatalog() {
    setSyncing(true);
    setSyncErr(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      setCatalog(json.items as SquareCatalogObject[]);
    } catch (e: unknown) {
      setSyncErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Square from this organization?")) return;
    await fetch("/api/square/disconnect", { method: "POST" });
    if (typeof window !== "undefined") window.location.reload();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Connection</h3>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row
            label="Status"
            value={connection ? "Connected" : "Not connected"}
          />
          <Row
            label="Square merchant"
            value={connection?.square_merchant_id ?? "—"}
            mono
          />
          <Row
            label="Square location"
            value={connection?.square_location_id ?? "—"}
            mono
          />
          <Row
            label="Token expires"
            value={
              connection
                ? new Date(connection.expires_at).toLocaleString()
                : "—"
            }
          />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {isOwner ? (
            connection ? (
              <>
                <button
                  className="btn-primary"
                  onClick={syncCatalog}
                  disabled={syncing || !configured}
                >
                  {syncing ? "Syncing…" : "Sync catalog"}
                </button>
                <button className="btn-ghost text-red-600" onClick={disconnect}>
                  Disconnect
                </button>
              </>
            ) : (
              <a className="btn-primary" href="/api/square/oauth/start">
                Connect Square Sandbox
              </a>
            )
          ) : (
            <p className="text-xs text-slate-500">
              Only the owner can manage the Square connection.
            </p>
          )}
        </div>
        {syncErr && (
          <p className="mt-3 text-sm text-red-700">{syncErr}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          Item link mapping
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Map each Nearby item to its Square catalog object id. We use
          this for both pushing redemption discounts and granting stamps on
          linked-item purchases.
        </p>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Add items first under Items.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const link = linkByItem.get(item.id);
              return (
                <ItemLinkRow
                  key={item.id}
                  item={item}
                  link={link ?? null}
                  catalog={catalog}
                  canEdit={canEdit && !!connection}
                  pending={pending}
                  start={start}
                  onChanged={() => force((x) => x + 1)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          Recent POS redemptions
        </h3>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No POS pushes yet. Once you redeem an offer with Square connected,
            we attempt a partial refund (= discount) on the most recent open
            payment at this location.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">When</th>
                <th className="py-2">Status</th>
                <th className="py-2">Square refund</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-700">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 text-slate-700">{p.status}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">
                    {p.square_refund_id ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-slate-500">
                    {p.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-slate-900 ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ItemLinkRow({
  item,
  link,
  catalog,
  canEdit,
  pending,
  start,
  onChanged,
}: {
  item: Item;
  link: SquareItemLink | null;
  catalog: SquareCatalogObject[] | null;
  canEdit: boolean;
  pending: boolean;
  start: (cb: () => void) => void;
  onChanged: () => void;
}) {
  const [catalogId, setCatalogId] = useState<string>(
    link?.square_catalog_object_id ?? "",
  );
  const [variationId, setVariationId] = useState<string>(
    link?.square_variation_id ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("item_id", item.id);
    fd.set("square_catalog_object_id", catalogId);
    if (variationId) fd.set("square_variation_id", variationId);
    start(async () => {
      const r = await linkItemAction(fd);
      if (!r.ok) setError(r.error || "Failed");
      else onChanged();
    });
  }

  function unlink() {
    setError(null);
    const fd = new FormData();
    fd.set("item_id", item.id);
    start(async () => {
      const r = await unlinkItemAction(fd);
      if (!r.ok) setError(r.error || "Failed");
      else {
        setCatalogId("");
        setVariationId("");
        onChanged();
      }
    });
  }

  const matched = catalog?.find((c) => c.id === catalogId);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{item.name}</p>
          <p className="text-xs text-slate-500">
            ${item.base_price.toFixed(2)} · max {item.max_discount_pct}% off
          </p>
        </div>
        {link && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
            Linked
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {catalog && catalog.length > 0 ? (
          <select
            value={catalogId}
            disabled={!canEdit || pending}
            onChange={(e) => {
              setCatalogId(e.target.value);
              setVariationId("");
            }}
            className="input"
          >
            <option value="">Select Square item…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            placeholder="Square catalog object id"
            value={catalogId}
            disabled={!canEdit || pending}
            onChange={(e) => setCatalogId(e.target.value)}
          />
        )}

        {matched && matched.variations.length > 0 ? (
          <select
            value={variationId}
            disabled={!canEdit || pending}
            onChange={(e) => setVariationId(e.target.value)}
            className="input"
          >
            <option value="">All variations</option>
            {matched.variations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.price != null ? ` — $${v.price.toFixed(2)}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            placeholder="Square variation id (optional)"
            value={variationId}
            disabled={!canEdit || pending}
            onChange={(e) => setVariationId(e.target.value)}
          />
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {canEdit && (
        <div className="mt-3 flex justify-end gap-2">
          {link && (
            <button
              type="button"
              className="btn-ghost text-red-600"
              onClick={unlink}
              disabled={pending}
            >
              Unlink
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={save}
            disabled={pending || !catalogId}
          >
            {pending ? "Saving…" : link ? "Update link" : "Link"}
          </button>
        </div>
      )}
    </div>
  );
}
