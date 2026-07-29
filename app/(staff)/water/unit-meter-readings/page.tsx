import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { listUnitMeterReadings } from "@/server/water/unit-meter-readings";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    unitId?: string;
    status?: "all" | "recorded" | "reviewed" | "approved" | "void";
    month?: string;
  }>;
};

export default async function UnitMeterReadingsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const result = await listUnitMeterReadings({
    query: params.q,
    unitId: params.unitId,
    status: params.status ?? "all",
    month: params.month,
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Water</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Unit Water Meter Readings</h1>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="secondary" shape="pill"><Link href="/water/unit-meter-readings/import">Upload Completed Template</Link></Button>
          <Button asChild variant="primary" shape="pill"><Link href="/water/unit-meter-readings/new">New Reading</Link></Button>
        </div>
      </div>
      <Panel className="text-sm text-zinc-600">
        Search, month, unit, and status filtering is wired through query parameters. Import support is present as a dedicated route, but Excel parsing is not enabled yet because the repo does not currently include an Excel parser dependency.
      </Panel>
      <div className="flex gap-3">
        <Link className="text-sm font-medium underline" href="/water/unit-meter-readings/new">Manual Entry</Link>
        <Link className="text-sm font-medium underline" href="/water/unit-meter-readings/import">Import</Link>
      </div>
      {result.error ? <Panel className="border-red-200 bg-red-50 text-sm text-red-700">{result.error}</Panel> : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Unit</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Reading Month</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Reading Date</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Current Reading</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Previous Reading</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Consumption</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Updated</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {result.data.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">{row.unit_number}</td>
                <td className="px-4 py-3">{row.reading_month_label}</td>
                <td className="px-4 py-3">{row.reading_date}</td>
                <td className="px-4 py-3">{row.reading_end ?? "—"}</td>
                <td className="px-4 py-3">{row.previous_reading_label}</td>
                <td className="px-4 py-3">{row.consumption ?? "—"}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{new Date(row.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-3">
                  <Link className="text-sm font-medium underline" href={`/water/unit-meter-readings/${row.id}`}>View</Link>
                  <Link className="text-sm font-medium underline" href={`/water/unit-meter-readings/${row.id}/edit`}>Edit</Link>
                  <Link className="text-sm font-medium underline text-red-700" href={`/water/unit-meter-readings/${row.id}/delete`}>Delete</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
