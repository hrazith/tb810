import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveUnitForm } from "../_components/archive-unit-form";
import { archiveUnitAction } from "../actions";
import { getUnitById } from "@/server/units";

type PageProps = {
  params: Promise<{
    unitId: string;
  }>;
};

function formatArea(value: number | null) {
  return value === null ? "—" : `${value.toFixed(3).replace(/\.?0+$/, "")} m²`;
}

function formatParticipation(value: number) {
  return `${value.toFixed(4).replace(/\.?0+$/, "")}%`;
}

export default async function UnitDetailPage({ params }: PageProps) {
  const { unitId } = await params;
  const result = await getUnitById(unitId);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    notFound();
  }

  const unit = result.data;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Unit
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              {unit.unit_number}
            </h1>
            <div className="space-y-1 text-sm text-zinc-600">
              <p>Type: {unit.unit_type_name}</p>
              <p>Building: {unit.building_name}</p>
              <p>Floor: {unit.floor ?? "—"}</p>
              <p>Registered area: {formatArea(unit.registered_area_m2)}</p>
              <p>Participation percentage: {formatParticipation(unit.participation_percentage)}</p>
              <p>Has individual meter: {unit.has_meter ? "Yes" : "No"}</p>
              <p>Status: {unit.active ? "Active" : "Inactive"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/units/${unit.id}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Edit
            </Link>
            {unit.active ? (
              <ArchiveUnitForm action={archiveUnitAction.bind(null, unit.id)} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Notes</h2>
          <p className="mt-3 text-sm text-zinc-600">
            {unit.notes ?? "No notes added."}
          </p>
        </section>

        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-950">
            Future sections
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600">
            <li>Ownership</li>
            <li>Unit accounts</li>
            <li>Meter readings</li>
            <li>Documents</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
