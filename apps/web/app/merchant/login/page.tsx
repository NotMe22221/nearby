"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function MerchantLoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <MerchantLoginInner />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <main className="app-shell">
      <div className="mt-10 h-6 w-40 animate-pulse rounded bg-ink-200" />
      <div className="mt-4 h-4 w-64 animate-pulse rounded bg-ink-100" />
    </main>
  );
}

function MerchantLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/merchant";

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setInfo(
            "Account created. If email confirmation is enabled in your Supabase project, check your inbox before signing in.",
          );
          setMode("sign-in");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <Link href="/" className="text-sm text-ink-900/60 hover:underline">
        &larr; back to offers
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Merchant sign in</h1>
      <p className="mt-1 text-sm text-ink-900/70">
        Manage your slow-hour offers and item rules.
      </p>

      <div className="mt-6 inline-flex rounded-xl bg-white p-1 ring-1 ring-ink-200">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            mode === "sign-in" ? "bg-accent-500 text-white" : "text-ink-900"
          }`}
          onClick={() => setMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            mode === "sign-up" ? "bg-accent-500 text-white" : "text-ink-900"
          }`}
          onClick={() => setMode("sign-up")}
        >
          Create account
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700 ring-1 ring-accent-100">
            {info}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </main>
  );
}
