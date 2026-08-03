import { notFound } from "next/navigation";

import { UnitForm } from "../../_components/unit-form";
import { updateUnitAction } from "../../actions";
import {
  getUnitByNumberForCurrentBuilding,
  getUnitFormDefaults,
} from "@/server/units";

type PageProps = {
  params: Promise<{
    unitNumber: string;
  }>;
};

export default async function EditUnitPage({ params }: PageProps) {
  const { unitNumber } = await params;
  const lookup = await getUnitByNumberForCurrentBuilding(unitNumber);

  if (lookup.error) {
    throw new Error(lookup.error);
  }

  if (!lookup.data) {
    notFound();
  }

  const defaults = await getUnitFormDefaults(lookup.data.id);

  if (defaults.error) {
    throw new Error(defaults.error);
  }

  if (!defaults.data.values.unit_number) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Units
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Edit Unit
        </h1>
      </div>

      <UnitForm
        defaults={defaults.data}
        action={updateUnitAction.bind(null, lookup.data.id)}
        submitLabel="Save changes"
      />
    </section>
  );
}
