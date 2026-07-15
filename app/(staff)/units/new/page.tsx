import { UnitForm } from "../_components/unit-form";
import { createUnitAction } from "../actions";
import { getUnitFormDefaults } from "@/server/units";

export default async function NewUnitPage() {
  const defaults = await getUnitFormDefaults();
  if (defaults.error) {
    throw new Error(defaults.error);
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Units
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Add Unit
        </h1>
      </div>

      <UnitForm
        defaults={defaults.data}
        action={createUnitAction}
        submitLabel="Save unit"
        cancelHref="/units"
      />
    </section>
  );
}
