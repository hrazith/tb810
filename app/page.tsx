import Link from "next/link";
import { redirect } from "next/navigation";

import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";

const shortcuts = [

  {
    href: "/water/sedapal",
    title: "Sedapal Water Bill",
    description: "You have not started yet.",
  },
  {
    href: "/water/unit-meter-readings",
    title: "Unit Water Readings",
    description: "Enter metered reding for individual units",
  },
] as const;

async function signOut() {
  "use server";

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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
        <div className="space-y-4 mt-12">
           
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
              Good morning, Guliana.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600">
              This is the operational home for TB810.
            </p>
          </div>
        <div className="space-y-10 rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          

          <div className="space-y-4">
            <p className="text-2xl font-semibold tracking-tight text-zinc-950">
              July 2026
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
