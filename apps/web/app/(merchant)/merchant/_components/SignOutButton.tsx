"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const supabase = createSupabaseBrowserClient();

  function handleClick() {
    start(async () => {
      await supabase.auth.signOut();
      router.replace("/merchant/login");
      router.refresh();
    });
  }

  return (
    <button onClick={handleClick} className="btn-ghost text-sm" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
