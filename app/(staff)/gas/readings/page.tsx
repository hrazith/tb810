import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { listGasReadings } from "@/server/gas";

export default async function GasReadingsPage() {
  const result = await listGasReadings();
  if (result.error) throw new Error(result.error);
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Gas Readings</h1>
        </div>
        <Button asChild variant="primary" shape="pill">
          <Link href="/gas/readings/new">Add Reading</Link>
        </Button>
      </div>
      <Panel className="overflow-hidden p-0">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Current</th>
              <th className="px-4 py-3">Consumption</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {result.data.map((reading) => (
              <tr key={reading.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3"><Link className="font-medium text-zinc-950" href={`/gas/readings/${reading.id}`}>{reading.unit_number}</Link></td>
                <td className="px-4 py-3 text-zinc-600">{reading.reading_month.slice(0, 7)}</td>
                <td className="px-4 py-3 text-zinc-600">{reading.reading_date}</td>
                <td className="px-4 py-3 text-zinc-600">{reading.current_reading.toFixed(3)}</td>
                <td className="px-4 py-3 text-zinc-600">{reading.consumption == null ? "—" : reading.consumption.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
