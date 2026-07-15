import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { listUnitTypes, listUnits } from "@/server/units";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    unitTypeId?: string;
    status?: "active" | "inactive" | "all";
  }>;
};

function formatArea(value: number | null) {
  return value === null ? "—" : `${value.toFixed(3).replace(/\.?0+$/, "")} m²`;
}

function formatParticipation(value: number) {
  return `${value.toFixed(4).replace(/\.?0+$/, "")}%`;
}

export default async function UnitsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const [unitsResult, unitTypesResult] = await Promise.all([
    listUnits({
      query: params.q,
      unitTypeId: params.unitTypeId,
      status: params.status,
    }),
    listUnitTypes(),
  ]);

  return (
    <section className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold text-zinc-900">Units</h1>
          <p className="mt-2 text-sm text-zinc-700">
            A staff view of asset records in TB810 with type, location, meter capability, lifecycle, and last update details.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          
          <Button asChild variant="primary" shape="pill">
  <Link href="/units/new">Add Unit</Link>
</Button>
        </div>
      </div>

      <Panel as="form" method="get" padding="compact" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by unit number, floor, or type"
          className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
        />
        <select
          name="unitTypeId"
          defaultValue={params.unitTypeId ?? ""}
          className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
        >
          <option value="">All types</option>
          {unitTypesResult.data.map((unitType) => (
            <option key={unitType.id} value={unitType.id}>
              {unitType.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? "active"}
          className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-xs transition hover:border-zinc-950 hover:text-zinc-950">
          Filter
        </button>
      </Panel>

      {unitsResult.error ? (
        <Panel className="border-red-200 bg-red-50 text-sm text-red-700">
          {unitsResult.error}
        </Panel>
      ) : unitsResult.data.length === 0 ? (
        <Panel padding="spacious" className="border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No units found.
        </Panel>
      ) : (
        <div className="grid gap-3">
          {unitsResult.data.map((unit) => (
            <Link
              key={unit.id}
              href={`/units/${unit.id}`}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:border-zinc-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Unit number
                    </p>
                    <span className="text-lg font-semibold text-zinc-950 underline decoration-transparent transition group-hover:decoration-zinc-950">
                      {unit.unit_number}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      <span className="font-medium text-zinc-900">Type:</span>{" "}
                      {unit.unit_type_name}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Floor:</span>{" "}
                      {unit.floor ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Registered area:</span>{" "}
                      {formatArea(unit.registered_area_m2)}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Participation:</span>{" "}
                      {formatParticipation(unit.participation_percentage)}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Meter:</span>{" "}
                      {unit.has_meter ? "Yes" : "No"}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Status:</span>{" "}
                      {unit.active ? "Active" : "Inactive"}
                    </p>
                    <p className="sm:col-span-2 lg:col-span-2">
                      <span className="font-medium text-zinc-900">Last updated:</span>{" "}
                      {new Date(unit.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                    unit.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {unit.active ? "Active" : "Inactive"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
