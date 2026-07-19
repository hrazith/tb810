export type BudgetPlanRecord = {
  id: string;
  building_id: string;
  plan_year: number;
  currency: "PEN" | string;
  monthly_operating_budget: string;
  created_at: string;
  updated_at: string;
};

export type BudgetPlanInput = {
  monthly_operating_budget: string;
};

export type BudgetPlanFormState = {
  success?: string;
  error?: string;
  fieldErrors?: Partial<Record<keyof BudgetPlanInput, string>>;
  values?: BudgetPlanInput;
};

export type UnitFixedMonthlyAssessment = {
  unitId: string;
  planYear: number;
  currency: string;
  monthlyOperatingBudget: string;
  assessmentPercentage: number;
  fixedMonthlyAssessment: string;
};

export type UnitFixedMonthlyAssessmentState =
  | {
      status: "ready";
      data: UnitFixedMonthlyAssessment;
    }
  | {
      status: "unavailable";
      reason:
        | "budget-plan-missing"
        | "unit-missing"
        | "assessment-percentage-missing"
        | "invalid-assessment-percentage";
      message: string;
      planYear?: number;
    };
