import { notFound } from "next/navigation";

import { getGasBillById } from "@/server/gas";
import { updateGasBillAction } from "@/server/gas/actions";

import { GasBillForm } from "../../../_components/gas-bill-form";

type PageProps = {
  params: Promise<{
    billId: string;
  }>;
};

export default async function EditGasBillPage({ params }: PageProps) {
  const { billId } = await params;
  const result = await getGasBillById(billId);
  if (result.error) throw new Error(result.error);
  if (!result.data) notFound();
  if (result.data.processed_at) notFound();

  return <GasBillForm action={updateGasBillAction} bill={result.data} submitLabel="Save Bill" />;
}
