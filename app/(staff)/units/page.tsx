import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { listUnitTypes, listUnits } from "@/server/units";

import { UnitsControls } from "./_components/units-controls";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    unitTypeId?: string;
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
    }),
    listUnitTypes(),
  ]);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
          Units
        </h1>
        <UnitsControls
          initialQuery={params.q ?? ""}
          initialUnitTypeId={params.unitTypeId ?? ""}
          unitTypes={unitTypesResult.data}
        />
      </div>

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
                      <span className="font-medium text-zinc-900">Owner:</span>{" "}
                      {unit.current_owner_name ?? "Unassigned"}
                    </p>
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
                    <p className="sm:col-span-2 lg:col-span-2">
                      <span className="font-medium text-zinc-900">Last updated:</span>{" "}
                      {new Date(unit.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
