"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActiveDevTestSessionSummary } from "@/server/dev-test-session";
import {
  commonWaterBillInputSchema,
  createCommonWaterBill,
  updateCommonWaterBill,
  getCommonWaterBillDocumentUrl,
} from "@/server/water";
import type { WaterBillFormState } from "@/server/water";
import { commonWaterBillUpdateInputSchema } from "@/server/water/validation";

function toInput(formData: FormData) {
  return {
    bill_date: String(formData.get("bill_date") ?? ""),
    previous_reading: String(formData.get("previous_reading") ?? ""),
    current_reading: String(formData.get("current_reading") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    source_pdf: formData.get("source_pdf"),
    description: String(formData.get("description") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function displayValues(values: ReturnType<typeof toInput>) {
  const safeValues = { ...values };
  delete (safeValues as { source_pdf?: unknown }).source_pdf;
  return safeValues;
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
  const devTestContext = formData.get("dev_test_context") === "1";
  let devSessionId: string | undefined;
  if (devTestContext) {
    const session = await getActiveDevTestSessionSummary();
    if (!session) {
      return { error: "Start an active DEV test session before using DEV Sedapal intake." };
    }
    devSessionId = session.id;
  }
  const validation = commonWaterBillInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values: displayValues(values),
    };
  }

  const result = await createCommonWaterBill(validation.data, { devSessionId });
  if (result.error) {
    return { error: result.error, values: displayValues(values) };
  }

  revalidatePath("/");
  revalidatePath("/units", "layout");
  revalidatePath("/water/sedapal");
  return {
    success: "Reading saved.",
    values: {},
  };
}

export async function viewCommonWaterBillAction(formData: FormData) {
  const billId = String(formData.get("utility_bill_id") ?? "");
  const result = await getCommonWaterBillDocumentUrl(billId);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Source PDF is unavailable.");
  }
  redirect(result.data);
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

  revalidatePath("/");
  revalidatePath("/units", "layout");
  revalidatePath("/water/sedapal");
  redirect("/water/sedapal");
}
