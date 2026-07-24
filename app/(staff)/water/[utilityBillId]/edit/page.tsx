import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
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
    redirect(`/water/${utilityBillId}`);
  }

  const bill = result.data;
  const readingDefaults = await getCommonWaterReadingDefaults(bill.bill_date);
  if (readingDefaults.error) {
    throw new Error(readingDefaults.error);
  }
  const canEditPreviousReading = !(readingDefaults.data?.hasPriorBill ?? true);

  return (
    <section className="space-y-6">
      <Panel as="div" className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Common Water Ledger
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              Edit Sedapal bill
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600">
              Update the open month only. Previous reading stays fixed from the
              prior Sedapal record.
            </p>
            <p className="text-sm text-zinc-500">
              {canEditPreviousReading ? "Opening Reading" : "Previous Reading"}:{" "}
              {formatReading(bill.previous_reading)}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/water/${bill.id}`}>Back to bill</Link>
          </Button>
        </div>
      </Panel>

      <CommonWaterBillForm
        action={updateCommonWaterBillAction}
        cancelHref={`/water/${bill.id}`}
        submitLabel="Update bill"
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
          description: bill.description ?? "",
          notes: bill.notes ?? "",
        }}
      />
    </section>
  );
}
