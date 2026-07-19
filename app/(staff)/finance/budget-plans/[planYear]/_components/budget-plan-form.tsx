"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type {
  BudgetPlanFormState,
  BudgetPlanRecord,
} from "@/server/budget-plans/types";

type Props = {
  budgetPlan: BudgetPlanRecord | null;
  action: (
    prevState: BudgetPlanFormState,
    formData: FormData,
  ) => Promise<BudgetPlanFormState>;
  planYear: number;
};

const initialState: BudgetPlanFormState = {};

function fieldError(field: string, state: BudgetPlanFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<BudgetPlanFormState["fieldErrors"]>
  ];
}

export function BudgetPlanForm({ budgetPlan, action, planYear }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <input type="hidden" name="plan_year" value={String(planYear)} />

      <label className="block space-y-2">
        <span className="block text-sm font-medium text-zinc-900">
          Monthly Operating Budget
        </span>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-medium text-zinc-500">
            PEN
          </span>
          <input
            name="monthly_operating_budget"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={budgetPlan?.monthly_operating_budget ?? ""}
            aria-invalid={
              fieldError("monthly_operating_budget", state) ? "true" : undefined
            }
            aria-describedby={
              fieldError("monthly_operating_budget", state)
                ? "monthly-operating-budget-error"
                : undefined
            }
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 pl-16 text-sm outline-none transition focus:border-zinc-950 aria-[invalid=true]:border-red-500"
          />
        </div>
        <p className="text-sm text-zinc-600">
          This amount will be distributed across the building&apos;s units to
          calculate each unit&apos;s monthly fixed assessment.
        </p>
        {fieldError("monthly_operating_budget", state) ? (
          <p id="monthly-operating-budget-error" className="text-sm text-red-600">
            {fieldError("monthly_operating_budget", state)}
          </p>
        ) : null}
      </label>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save budget"}
      </Button>
    </Panel>
  );
}
