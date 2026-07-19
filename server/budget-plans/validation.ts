import { z } from "zod";

function normalizeMoneyString(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export const budgetPlanInputSchema = z.object({
  monthly_operating_budget: z
    .string({ error: "Monthly Operating Budget is required." })
    .trim()
    .min(1, "Monthly Operating Budget is required.")
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "Enter a valid PEN amount.")
    .transform((value) => normalizeMoneyString(value)),
});

export type BudgetPlanInputSchema = z.infer<typeof budgetPlanInputSchema>;
