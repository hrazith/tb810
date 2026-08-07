import { notFound } from "next/navigation";

import { getCurrentBuilding } from "@/server/units";
import { createGasBillAction } from "@/server/gas/actions";

import { GasBillForm } from "../../_components/gas-bill-form";

export default async function NewGasBillPage() {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) throw new Error(buildingResult.error);
  if (!buildingResult.data) notFound();

  return (
    <GasBillForm
      action={createGasBillAction}
      bill={{ id: "", building_id: buildingResult.data.id } as never}
      submitLabel="Save Bill"
    />
  );
}
