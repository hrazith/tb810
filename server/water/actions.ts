"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCommonWaterBillForCurrentBusinessMonth } from "./dev-bill";
import { completeMissingWaterReadingsForCurrentBusinessMonth } from "./dev-completion";

export type WaterFormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

function returnToValue(formData: FormData) {
  return String(formData.get("return_to") ?? "/").trim() || "/";
}

export async function completeWaterReadingsAction(formData: FormData): Promise<void> {
  const returnTo = returnToValue(formData);
  const sourceReadingMonth = String(formData.get("source_reading_month") ?? "").trim();
  const result = await completeMissingWaterReadingsForCurrentBusinessMonth(sourceReadingMonth);
  if (result.error) {
    redirect(`${returnTo}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/", "layout");
  redirect(returnTo);
}

export async function addCommonWaterBillAction(formData: FormData): Promise<void> {
  const returnTo = returnToValue(formData);
  const obligationMonth = String(formData.get("obligation_month") ?? "").trim();
  const sourceBillingMonth = String(formData.get("source_billing_month") ?? "").trim();
  const result = await addCommonWaterBillForCurrentBusinessMonth(obligationMonth, sourceBillingMonth);
  if (result.error) {
    redirect(`${returnTo}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/", "layout");
  redirect(returnTo);
}
