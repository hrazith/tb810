import { getCommonWaterReadingDefaults } from "@/server/water";

import { CommonWaterBillForm } from "../_components/common-water-bill-form";
import { createCommonWaterBillAction } from "../actions";

export default async function NewWaterBillPage() {
  const defaultsResult = await getCommonWaterReadingDefaults();

  if (defaultsResult.error) {
    throw new Error(defaultsResult.error);
  }

  return (
    <CommonWaterBillForm
      action={createCommonWaterBillAction}
      submitLabel="Save Reading"
      previousReadingHelpText="Loaded automatically from the most recent prior Sedapal reading."
      previousReadingLabel="Previous Reading"
      previousReadingReadOnly
      initialValues={{
        previous_reading: String(defaultsResult.data?.previousReading ?? ""),
      }}
      showDescription={false}
      showNotes={false}
      showSummary={false}
      compact
    />
  );
}
