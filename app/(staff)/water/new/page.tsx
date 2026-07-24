import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getCommonWaterReadingDefaults } from "@/server/water";

import { createCommonWaterBillAction } from "../actions";
import { CommonWaterBillForm } from "../_components/common-water-bill-form";

function formatReading(value: number | null) {
  if (value === null) {
    return "0";
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function NewWaterBillPage() {
  const result = await getCommonWaterReadingDefaults();
  if (result.error) {
    throw new Error(result.error);
  }

  const previousReading = result.data?.previousReading ?? 0;
  const hasPriorBill = result.data?.hasPriorBill ?? false;

  return (
    <section className="space-y-6">
      <Panel as="div" className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Common Water Ledger
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Add monthly Sedapal bill
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Enter the invoice exactly as it arrives. TB810 will calculate the
          total consumption and unit cost automatically. The previous reading
          is loaded from the latest Sedapal record when one exists.
        </p>
        <p className="text-sm text-zinc-500">
          {hasPriorBill ? "Previous Reading" : "Opening Reading"}:{" "}
          {formatReading(result.data?.previousReading ?? 0)}{" "}
          {hasPriorBill
            ? "(from prior Sedapal reading)"
            : "(first-record opening reading)"}
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link href="/water">Back to ledger</Link>
        </Button>
      </Panel>

      <CommonWaterBillForm
        action={createCommonWaterBillAction}
        cancelHref="/water"
        submitLabel="Save bill"
        previousReadingHelpText={
          hasPriorBill
            ? "Loaded automatically from the most recent prior Sedapal common-water bill."
            : "Giuliana enters the starting meter value manually for the first record."
        }
        previousReadingLabel={hasPriorBill ? "Previous Reading" : "Opening Reading"}
        previousReadingReadOnly={hasPriorBill}
        initialValues={{
          previous_reading: formatReading(previousReading),
        }}
      />
    </section>
  );
}
