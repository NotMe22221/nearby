import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOrgContext } from "@/lib/auth/membership";
import { SignOutButton } from "./_components/SignOutButton";

export const dynamic = "force-dynamic";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/locations", label: "Locations" },
  { href: "/merchant/items", label: "Items" },
  { href: "/merchant/rules", label: "Rules" },
  { href: "/merchant/approvals", label: "Approvals" },
  { href: "/merchant/loyalty", label: "Loyalty" },
  { href: "/merchant/payments", label: "Payments" },
  { href: "/merchant/pos", label: "POS" },
  { href: "/merchant/org", label: "Team" },
  { href: "/merchant/scanner", label: "Scanner" },
];

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/merchant/login");
  }

  const ctx = await ensureOrgContext();
  const orgName = ctx?.organization.name ?? null;

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/merchant" className="font-semibold">
              Nearby <span className="text-ink-900/40">/ merchant</span>
            </Link>
            {orgName && (
              <span className="hidden text-sm text-ink-900/60 md:inline">
                · {orgName}
              </span>
            )}
            {ctx?.role && (
              <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-900/60 md:inline">
                {ctx.role}
              </span>
            )}
          </div>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <SignOutButton />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden">
          {NAV_ITEMS.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="app-shell-wide max-w-6xl">{children}</div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-900/80 hover:bg-ink-100"
    >
      {children}
    </Link>
  );
}
