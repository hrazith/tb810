"use server";

import { revalidatePath } from "next/cache";

import { upsertBudgetPlan } from "@/server/budget-plans";
import type { BudgetPlanFormState } from "@/server/budget-plans/types";
import { budgetPlanInputSchema } from "@/server/budget-plans/validation";

function toBudgetPlanInput(formData: FormData) {
  return {
    monthly_operating_budget: String(formData.get("monthly_operating_budget") ?? ""),
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

export async function upsertBudgetPlanAction(
  planYear: number,
  _prev: BudgetPlanFormState,
  formData: FormData,
): Promise<BudgetPlanFormState> {
  const values = toBudgetPlanInput(formData);
  const validation = budgetPlanInputSchema.safeParse(values);

  if (!validation.success) {
    return {
      error: "Please fix the highlighted field.",
      fieldErrors: mapFieldErrors(validation.error.issues),
      values,
    };
  }

  const result = await upsertBudgetPlan({
    planYear,
    monthlyOperatingBudget: validation.data.monthly_operating_budget,
  });

  if (result.error) {
    return {
      error: result.error,
      values: {
        monthly_operating_budget: validation.data.monthly_operating_budget,
      },
    };
  }

  revalidatePath(`/finance/budget-plans/${planYear}`);
  revalidatePath("/dashboard");

  return {
    success: "Budget Plan saved.",
    values: {
      monthly_operating_budget: result.data.monthly_operating_budget,
    },
  };
}
