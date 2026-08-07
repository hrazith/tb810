import Link from "next/link";

import { Panel } from "@/components/ui/panel";

export default function GasHomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Gas Domain</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600">
          Capture supplier gas bills and monthly gas meter readings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel as={Link} href="/gas/bills" className="space-y-2 transition hover:border-zinc-950 hover:bg-zinc-50">
          <h2 className="text-xl font-semibold text-zinc-950">Supplier Bills</h2>
          <p className="text-sm text-zinc-600">Create, edit, delete, and review draft or processed bills.</p>
        </Panel>
        <Panel as={Link} href="/gas/readings" className="space-y-2 transition hover:border-zinc-950 hover:bg-zinc-50">
          <h2 className="text-xl font-semibold text-zinc-950">Gas Readings</h2>
          <p className="text-sm text-zinc-600">Capture monthly readings for gas-enabled condo units.</p>
        </Panel>
      </div>
    </section>
  );
}
