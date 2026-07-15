import Link from "next/link";

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
          <Link
            href="/units/new"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Add Unit
          </Link>
        </div>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]"
      >
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
      </form>

      {unitsResult.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {unitsResult.error}
        </div>
      ) : unitsResult.data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-600">
          No units found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Unit number</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Floor</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Registered area</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Participation</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Meter</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {unitsResult.data.map((unit) => (
                  <tr key={unit.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-950">
                      <Link href={`/units/${unit.id}`} className="hover:underline">
                        {unit.unit_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{unit.unit_type_name}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{unit.floor ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{formatArea(unit.registered_area_m2)}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{formatParticipation(unit.participation_percentage)}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{unit.has_meter ? "Yes" : "No"}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${unit.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
                        {unit.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {new Date(unit.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
