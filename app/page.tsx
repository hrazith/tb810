import Link from "next/link";
import { redirect } from "next/navigation";

import { brandConfig } from "@/brand";
import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./(staff)/actions";

const shortcuts = [
  {
    href: "/water",
    title: "Water",
    description: "Enter the water domain and monthly ledger.",
  },
  {
    href: "/units",
    title: "Units",
    description: "Review physical units and their billing context.",
  },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <Header userEmail={user.email ?? ""} signOutAction={signOut} />

      <section className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
        <div className="space-y-10 rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
              {brandConfig.shortName}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
              Good morning, Guliana.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600">
              This is the operational home for TB810.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Operations
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {shortcuts.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white"
                >
                  <p className="text-sm font-semibold text-zinc-950">
                    {shortcut.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {shortcut.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Recent Activity
            </p>
            <PanelPlaceholder />
          </div>
        </div>
      </section>
    </main>
  );
}

function PanelPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
      Placeholder
    </div>
  );
}
