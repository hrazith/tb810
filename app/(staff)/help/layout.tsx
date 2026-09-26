import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react/dist/ssr";

export default function HelpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="px-6 py-8 sm:py-12">
      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
        <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
          <div className="flex items-center gap-3 text-zinc-950">
            <BookOpen size={22} weight="regular" aria-hidden="true" />
            <p className="text-lg font-semibold">Help &amp; Documentation</p>
          </div>
          <nav aria-label="Help articles" className="space-y-1 border-l border-zinc-200 pl-4 text-sm">
            <Link
              href="/help/obligations"
              className="block rounded-lg px-3 py-2 font-medium text-zinc-950 transition hover:bg-white"
            >
              Obligations
            </Link>
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
