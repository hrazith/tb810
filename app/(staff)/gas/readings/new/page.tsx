import { notFound } from "next/navigation";

import { createGasReadingAction } from "@/server/gas/actions";
import { getCurrentBuilding, listUnits } from "@/server/units";

import { GasReadingForm } from "../../_components/gas-reading-form";

export default async function NewGasReadingPage() {
  const [buildingResult, unitsResult] = await Promise.all([getCurrentBuilding(), listUnits()]);
  if (buildingResult.error) throw new Error(buildingResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (!buildingResult.data) notFound();

  return (
    <GasReadingForm
      action={createGasReadingAction}
      units={unitsResult.data}
      submitLabel="Save Reading"
    />
  );
}
