import { getCommonWaterReadingDefaults } from "@/server/water";

import { CommonWaterBillForm } from "../_components/common-water-bill-form";
import { createCommonWaterBillAction } from "../actions";

export default async function NewWaterBillPage({
  searchParams,
}: {
  searchParams: Promise<{ dev_test?: string }>;
}) {
  const params = await searchParams;
  const defaultsResult = await getCommonWaterReadingDefaults();

  if (defaultsResult.error) {
    throw new Error(defaultsResult.error);
  }

  return (
    <CommonWaterBillForm
      action={createCommonWaterBillAction}
      devTestContext={params.dev_test === "1"}
      submitLabel="Save Sedapal Bill"
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
