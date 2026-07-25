import { getCurrentBuilding } from "@/server/units";
import { getCommonWaterReadingDefaults } from "@/server/water";

import { createCommonWaterBillAction } from "../actions";
import { CommonWaterBillForm } from "../_components/common-water-bill-form";

export default async function NewWaterPage() {
  const [buildingResult, defaultsResult] = await Promise.all([
    getCurrentBuilding(),
    getCommonWaterReadingDefaults(),
  ]);

  if (buildingResult.error) {
    throw new Error(buildingResult.error);
  }

  if (defaultsResult.error) {
    throw new Error(defaultsResult.error);
  }

  const previousReading = defaultsResult.data?.previousReading ?? "";

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        Common Water Ledger
      </h1>
      <CommonWaterBillForm
        action={createCommonWaterBillAction}
        submitLabel="Save Reading"
        previousReadingHelpText="Loaded automatically from the most recent prior Sedapal reading."
        previousReadingLabel="Previous Reading"
        previousReadingReadOnly
        initialValues={{
          previous_reading: previousReading ? String(previousReading) : "",
        }}
        showDescription={false}
        showNotes={false}
        showSummary={false}
      />
    </section>
  );
}
