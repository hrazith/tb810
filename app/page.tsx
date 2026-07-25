import Link from "next/link";

import { Button } from "@/components/ui/button";
import { brandConfig } from "@/brand";

const shortcuts = [
  {
    href: "/dashboard",
    title: "Dashboard",
    description: "See the current operational picture for TB810.",
  },
  {
    href: "/owners",
    title: "Owners",
    description: "Browse owners, ownership history, and unit assignments.",
  },
  {
    href: "/units",
    title: "Units",
    description: "Review physical assets, participation, and billing context.",
  },
] as const;

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#fafafa_45%,_#f4f4f5_100%)] px-6 py-16">
      <section className="w-full max-w-5xl rounded-[2rem] border border-zinc-200 bg-white/90 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)] backdrop-blur sm:p-10 lg:p-14">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          <div className="space-y-6 ">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
                {brandConfig.shortName}
              </p>
              <h1 className="max-w-2xl text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
                The operational home for TB810.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-600">
                Navigate owners, units, and monthly operations from one place.
                The app is built for the business rhythm, not a generic module
                maze.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" shape="pill">
                <Link href="/dashboard">Open Dashboard</Link>
              </Button>
              <Button asChild variant="secondary" shape="pill">
                <Link href="/owners">Browse Owners</Link>
              </Button>
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Quick Links
            </p>
            <div className="mt-4 space-y-3">
              {shortcuts.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-950 hover:shadow-sm"
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
          </aside>
        </div>
      </section>
    </main>
  );
}
