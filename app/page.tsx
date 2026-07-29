import Link from "next/link";

import { brandConfig } from "@/brand";
import Image from "next/image";
import { SignOut } from "@/brand";

const shortcuts = [

  {
    href: "/water/sedapal",
    title: "Sedapal Water Bill",
    description: "You have not started yet.",
  },
  {
    href: "/unit-water",
    title: "Unit Water Readings",
    description: "Enter metered reding for individual units",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to operations home">
              <Image
                src="/TB810.svg"
                alt={brandConfig.shortName}
                width={105}
                height={27}
                priority
              />
            </Link>
            <nav className="ml-12 flex items-center gap-6 text-md font-medium text-zinc-700">
              <Link href="/owners" className="inline-flex items-center gap-2 transition hover:text-zinc-950">
                Owners
              </Link>
              <Link href="/units" className="inline-flex items-center gap-2 transition hover:text-zinc-950">
                Units
              </Link>
              <Link
                href="/water"
                className="inline-flex items-center gap-2 transition hover:text-zinc-950"
              >
                Water
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <p className="text-sm text-zinc-600">hrazith@gmail.com</p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 transition hover:cursor-pointer hover:border-zinc-950 hover:text-zinc-950"
              >
                <SignOut aria-hidden size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
        <div className="space-y-10 rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="space-y-4">
           
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
              Good morning, Guliana.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600">
              This is the operational home for TB810.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              JULY 2026
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
