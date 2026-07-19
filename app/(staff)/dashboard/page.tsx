import Link from "next/link";

import { Panel } from "@/components/ui/panel";

export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <Panel as="div" className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm leading-6 text-zinc-600">
          TB810 staff access is ready.
        </p>
      </Panel>

      <Link href="/finance/budget-plans/2027" className="block">
        <Panel
          as="div"
          className="group space-y-3 border-zinc-200 transition hover:border-zinc-950 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Finance
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                2027 Budget Plan
              </h2>
            </div>
            <span className="text-sm font-medium text-zinc-950 transition group-hover:translate-x-0.5">
              Resume →
            </span>
          </div>
        </Panel>
      </Link>
    </section>
  );
}
