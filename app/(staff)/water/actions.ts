"use server";

import { redirect } from "next/navigation";

import {
  commonWaterBillInputSchema,
  createCommonWaterBill,
  updateCommonWaterBill,
} from "@/server/water";
import type { WaterBillFormState } from "@/server/water";
import { commonWaterBillUpdateInputSchema } from "@/server/water/validation";

function toInput(formData: FormData) {
  return {
    bill_date: String(formData.get("bill_date") ?? ""),
    previous_reading: String(formData.get("previous_reading") ?? ""),
    current_reading: String(formData.get("current_reading") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function toUpdateInput(formData: FormData) {
  return {
    bill_date: String(formData.get("bill_date") ?? ""),
    previous_reading: String(formData.get("previous_reading") ?? ""),
    current_reading: String(formData.get("current_reading") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function mapFieldErrors(
  issues: Array<{ path: ReadonlyArray<PropertyKey>; message: string }>,
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export async function createCommonWaterBillAction(
  _prev: WaterBillFormState,
  formData: FormData,
): Promise<WaterBillFormState> {
  const values = toInput(formData);
  const validation = commonWaterBillInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await createCommonWaterBill(validation.data);
  if (result.error) {
    return { error: result.error, values };
  }

  redirect(`/water/${result.data.id}`);
}

export async function updateCommonWaterBillAction(
  _prev: WaterBillFormState,
  formData: FormData,
): Promise<WaterBillFormState> {
  const billId = String(formData.get("utility_bill_id") ?? "");
  const values = toUpdateInput(formData);
  const validation = commonWaterBillUpdateInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await updateCommonWaterBill(billId, validation.data);
  if (result.error) {
    return { error: result.error, values };
  }

  redirect(`/water/${result.data.id}`);
}
