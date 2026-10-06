import { notFound, redirect } from "next/navigation";

import {
  getCommonWaterReadingDefaults,
  getWaterBillById,
} from "@/server/water";

import { updateCommonWaterBillAction } from "../../actions";
import { CommonWaterBillForm } from "../../_components/common-water-bill-form";

type PageProps = {
  params: Promise<{
    utilityBillId: string;
  }>;
};

function formatReading(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function EditWaterBillPage({ params }: PageProps) {
  const { utilityBillId } = await params;
  const result = await getWaterBillById(utilityBillId);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    notFound();
  }

  if (!result.data.is_editable) {
    redirect(`/water/sedapal/${utilityBillId}`);
  }

  const bill = result.data;
  const readingDefaults = await getCommonWaterReadingDefaults(bill.bill_date);
  if (readingDefaults.error) {
    throw new Error(readingDefaults.error);
  }
  const canEditPreviousReading = !(readingDefaults.data?.hasPriorBill ?? true);

  return (
    <section className="mx-auto my-12 w-full max-w-sm space-y-6 rounded-2xl bg-white p-10 sm:p-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        Edit Sedapal bill
      </h1>

      <CommonWaterBillForm
        action={updateCommonWaterBillAction}
        submitLabel="Update bill"
        cancelHref={`/water/sedapal/${bill.id}`}
        previousReadingHelpText={
          canEditPreviousReading
            ? "Giuliana can adjust the opening reading until this first record is locked."
            : "This value comes automatically from the prior Sedapal bill and cannot be edited."
        }
        previousReadingLabel={
          canEditPreviousReading ? "Opening Reading" : "Previous Reading"
        }
        previousReadingReadOnly={!canEditPreviousReading}
        utilityBillId={bill.id}
        initialValues={{
          bill_date: bill.bill_date,
          previous_reading: formatReading(bill.previous_reading),
          current_reading: formatReading(bill.current_reading),
          amount: bill.amount.toFixed(2),
        }}
        showDescription={false}
        showNotes={false}
        showSummary={false}
      />
    </section>
  );
}
