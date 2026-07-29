import { getReadingDefaults, getUnitOptions } from "@/server/water/unit-meter-readings";
import { createUnitMeterReadingAction } from "../actions";
import { UnitMeterReadingForm } from "../_components/unit-meter-reading-form";

export default async function NewUnitMeterReadingPage() {
  const [units, defaults] = await Promise.all([getUnitOptions(), getReadingDefaults()]);
  if (units.error) throw new Error(units.error);
  if (defaults.error) throw new Error(defaults.error);
  return (
    <UnitMeterReadingForm
      action={createUnitMeterReadingAction}
      submitLabel="Save Reading"
      units={units.data}
      readingDefaults={defaults.data ?? undefined}
    />
  );
}
