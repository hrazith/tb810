import Link from "next/link";
import { Rows, SquaresFour } from "@phosphor-icons/react/dist/ssr";

import { Panel } from "@/components/ui/panel";
import { listUnitTypes, listUnits } from "@/server/units";

import { UnitsControls } from "./_components/units-controls";
import { UnitsTable } from "./_components/units-table";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    unitTypeId?: string;
    view?: "cards" | "table";
  }>;
};

function formatParticipation(value: number) {
  return `${value.toFixed(4).replace(/\.?0+$/, "")}%`;
}

export default async function UnitsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const view = params.view ?? "cards";
  const [unitsResult, unitTypesResult] = await Promise.all([
    listUnits({
      query: params.q,
      unitTypeId: params.unitTypeId,
    }),
    listUnitTypes(),
  ]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
          Units
        </h1>
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-center xl:justify-end">
          <div className="flex items-center gap-2 self-end xl:self-auto">
            <Link
              href={`/units?${new URLSearchParams({
                ...(params.q ? { q: params.q } : {}),
                ...(params.unitTypeId ? { unitTypeId: params.unitTypeId } : {}),
                view: "cards",
              }).toString()}`}
              aria-label="Card view"
              className={[
                "flex h-12 w-12 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
                view === "cards"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-200",
              ].join(" ")}
            >
              <SquaresFour size={18} weight="bold" />
            </Link>
            <Link
              href={`/units?${new URLSearchParams({
                ...(params.q ? { q: params.q } : {}),
                ...(params.unitTypeId ? { unitTypeId: params.unitTypeId } : {}),
                view: "table",
              }).toString()}`}
              aria-label="Table view"
              className={[
                "flex h-12 w-12 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
                view === "table"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-200",
              ].join(" ")}
            >
              <Rows size={18} weight="bold" />
            </Link>
          </div>
          <UnitsControls
            initialQuery={params.q ?? ""}
            initialUnitTypeId={params.unitTypeId ?? ""}
            unitTypes={unitTypesResult.data}
          />
        </div>
      </div>

      {unitsResult.error ? (
        <Panel className="border-red-200 bg-red-50 text-sm text-red-700">
          {unitsResult.error}
        </Panel>
      ) : unitsResult.data.length === 0 ? (
        <Panel padding="spacious" className="border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No units found.
        </Panel>
      ) : view === "table" ? (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <UnitsTable units={unitsResult.data} />
              </div>
            </div>
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {unitsResult.data.map((unit) => (
            <Link
              key={unit.id}
              href={`/units/${unit.id}`}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:border-zinc-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="block text-lg font-semibold text-zinc-950 underline decoration-transparent transition group-hover:decoration-zinc-950">
                    {unit.unit_number}
                  </span>
                </div>
                <div className="grid gap-2 text-sm text-zinc-600">
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
                    <span className="font-medium text-zinc-900">Participation:</span>{" "}
                    {formatParticipation(unit.participation_percentage)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
