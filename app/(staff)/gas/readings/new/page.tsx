import { notFound } from "next/navigation";

import { createGasReadingAction } from "@/server/gas/actions";
import { listGasReadings } from "@/server/gas";
import { getCurrentBuilding, listUnitTypes, listUnits } from "@/server/units";

import { GasReadingForm } from "../../_components/gas-reading-form";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function NewGasReadingPage() {
  const selectedMonth = currentMonthKey();
  const [buildingResult, unitTypesResult, unitsResult, readingsResult] = await Promise.all([
    getCurrentBuilding(),
    listUnitTypes(),
    listUnits(),
    listGasReadings(),
  ]);
  if (buildingResult.error) throw new Error(buildingResult.error);
  if (unitTypesResult.error) throw new Error(unitTypesResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (readingsResult.error) throw new Error(readingsResult.error);
  if (!buildingResult.data) notFound();

  const condoType = unitTypesResult.data.find((unitType) => unitType.code === "condo");
  if (!condoType) throw new Error("Condo unit type is missing.");

  return (
    <GasReadingForm
      action={createGasReadingAction}
      units={unitsResult.data.filter((unit) => unit.unit_type_id === condoType.id && unit.has_gas_service)}
      readings={readingsResult.data}
      submitLabel="Save Reading"
      initialMonth={selectedMonth}
    />
  );
}
