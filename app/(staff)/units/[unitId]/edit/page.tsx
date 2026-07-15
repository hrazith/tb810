import { notFound } from "next/navigation";

import { UnitForm } from "../../_components/unit-form";
import { updateUnitAction } from "../../actions";
import { getUnitFormDefaults } from "@/server/units";

type PageProps = {
  params: Promise<{
    unitId: string;
  }>;
};

export default async function EditUnitPage({ params }: PageProps) {
  const { unitId } = await params;
  const defaults = await getUnitFormDefaults(unitId);

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
        action={updateUnitAction.bind(null, unitId)}
        submitLabel="Save changes"
        cancelHref={`/units/${unitId}`}
      />
    </section>
  );
}
