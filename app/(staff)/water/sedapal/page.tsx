import { getCurrentBuilding } from "@/server/units";
import { getCommonWaterReadingDefaults, listCommonWaterBills } from "@/server/water";

import { WaterLedgerWorkspace } from "./_components/water-ledger-workspace";

export default async function WaterSedapalPage() {
  const [buildingResult, billsResult, defaultsResult] = await Promise.all([
    getCurrentBuilding(),
    listCommonWaterBills(),
    getCommonWaterReadingDefaults(),
  ]);

  if (buildingResult.error) {
    throw new Error(buildingResult.error);
  }

  if (billsResult.error) {
    throw new Error(billsResult.error);
  }

  if (defaultsResult.error) {
    throw new Error(defaultsResult.error);
  }

  if (!buildingResult.data) {
    return <p className="text-sm text-zinc-600">No building is available.</p>;
  }

  return (
    <WaterLedgerWorkspace
      bills={billsResult.data}
      previousReading={String(defaultsResult.data?.previousReading ?? "")}
    />
  );
}
