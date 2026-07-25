import { getCurrentBuilding } from "@/server/units";
import { listCommonWaterBills } from "@/server/water";

import { WaterLedgerWorkspace } from "./_components/water-ledger-workspace";

export default async function WaterPage() {
  const [buildingResult, billsResult] = await Promise.all([
    getCurrentBuilding(),
    listCommonWaterBills(),
  ]);

  if (buildingResult.error) {
    throw new Error(buildingResult.error);
  }

  if (billsResult.error) {
    throw new Error(billsResult.error);
  }

  const building = buildingResult.data;

  if (!building) {
    return <p className="text-sm text-zinc-600">No building is available.</p>;
  }

  return (
    <WaterLedgerWorkspace
      buildingName={building.name}
      bills={billsResult.data}
    />
  );
}
