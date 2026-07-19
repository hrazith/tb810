import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding } from "@/server/units";

import type {
  BudgetPlanInput,
  BudgetPlanRecord,
  UnitFixedMonthlyAssessmentState,
} from "./types";
import { budgetPlanInputSchema } from "./validation";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

const BUDGET_PLAN_SELECT =
  "id, building_id, plan_year, currency, monthly_operating_budget, created_at, updated_at" as const;
const UNIT_SELECT =
  "id, building_id, participation_percentage" as const;

function toBudgetPlanRecord(row: {
  id: string;
  building_id: string;
  plan_year: number;
  currency: string;
  monthly_operating_budget: number | string;
  created_at: string;
  updated_at: string;
}): BudgetPlanRecord {
  return {
    ...row,
    currency: row.currency,
    monthly_operating_budget: String(row.monthly_operating_budget),
  };
}

function parseDecimalValue(value: string): {
  integer: bigint;
  scale: bigint;
} | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  const scale = BigInt(10 ** normalizedFraction.length);
  const integer = BigInt(`${whole}${normalizedFraction || ""}`);

  return {
    integer,
    scale: normalizedFraction.length > 0 ? scale : BigInt(1),
  };
}

function formatMoney(cents: bigint) {
  const negative = cents < BigInt(0);
  const absolute = negative ? -cents : cents;
  const whole = absolute / BigInt(100);
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function calculateFixedMonthlyAssessment(
  monthlyOperatingBudget: string,
  assessmentPercentage: number,
) {
  const budget = parseDecimalValue(monthlyOperatingBudget);
  const percentage = parseDecimalValue(assessmentPercentage.toString());

  if (!budget || !percentage) {
    return null;
  }

  const numerator = budget.integer * percentage.integer * BigInt(100);
  const denominator = budget.scale * percentage.scale * BigInt(100);
  const roundedCents = (numerator + denominator / BigInt(2)) / denominator;

  return formatMoney(roundedCents);
}

export async function getBudgetPlanByYear(
  planYear: number,
): Promise<QueryResult<BudgetPlanRecord | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_budget_plans")
    .select(BUDGET_PLAN_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("plan_year", planYear)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  return { data: toBudgetPlanRecord(data), error: null };
}

export async function upsertBudgetPlan(input: {
  planYear: number;
  monthlyOperatingBudget: string;
}): Promise<QueryResult<BudgetPlanRecord>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const parsed = budgetPlanInputSchema.safeParse({
    monthly_operating_budget: input.monthlyOperatingBudget,
  });

  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Please fix the highlighted field.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_budget_plans")
    .upsert(
      {
        building_id: buildingResult.data.id,
        plan_year: input.planYear,
        currency: "PEN",
        monthly_operating_budget: parsed.data.monthly_operating_budget,
      },
      {
        onConflict: "building_id,plan_year",
      },
    )
    .select(BUDGET_PLAN_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };

  return { data: toBudgetPlanRecord(data), error: null };
}

export async function getBudgetPlanContext() {
  return getCurrentBuilding();
}

export async function getLatestBudgetPlanForCurrentBuilding(): Promise<
  QueryResult<BudgetPlanRecord | null>
> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_budget_plans")
    .select(BUDGET_PLAN_SELECT)
    .eq("building_id", buildingResult.data.id)
    .order("plan_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  return { data: toBudgetPlanRecord(data), error: null };
}

export async function getUnitFixedMonthlyAssessment({
  unitId,
  planYear,
}: {
  unitId: string;
  planYear: number;
}): Promise<UnitFixedMonthlyAssessmentState> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) {
    return {
      status: "unavailable",
      reason: "budget-plan-missing",
      message: buildingResult.error,
      planYear,
    };
  }

  if (!buildingResult.data) {
    return {
      status: "unavailable",
      reason: "budget-plan-missing",
      message: `Fixed Monthly Assessment is unavailable because the ${planYear} Budget Plan has not been entered.`,
      planYear,
    };
  }

  const supabase = await createClient();
  const [{ data: unit, error: unitError }, { data: plan, error: planError }] =
    await Promise.all([
      supabase
        .from("tb810_units")
        .select(UNIT_SELECT)
        .eq("id", unitId)
        .maybeSingle(),
      supabase
        .from("tb810_budget_plans")
        .select(BUDGET_PLAN_SELECT)
        .eq("building_id", buildingResult.data.id)
        .eq("plan_year", planYear)
        .maybeSingle(),
    ]);

  if (unitError) {
    return {
      status: "unavailable",
      reason: "unit-missing",
      message: unitError.message,
      planYear,
    };
  }

  if (!unit) {
    return {
      status: "unavailable",
      reason: "unit-missing",
      message: "Fixed Monthly Assessment is unavailable because this Unit could not be found.",
      planYear,
    };
  }

  if (planError) {
    return {
      status: "unavailable",
      reason: "budget-plan-missing",
      message: planError.message,
      planYear,
    };
  }

  if (!plan) {
    return {
      status: "unavailable",
      reason: "budget-plan-missing",
      message: `Fixed Monthly Assessment is unavailable because the ${planYear} Budget Plan has not been entered.`,
      planYear,
    };
  }

  if (unit.participation_percentage === null || unit.participation_percentage === undefined) {
    return {
      status: "unavailable",
      reason: "assessment-percentage-missing",
      message:
        "Fixed Monthly Assessment is unavailable because this Unit does not have an Assessment Percentage.",
      planYear,
    };
  }

  const fixedMonthlyAssessment = calculateFixedMonthlyAssessment(
    String(plan.monthly_operating_budget),
    unit.participation_percentage,
  );

  if (!fixedMonthlyAssessment) {
    return {
      status: "unavailable",
      reason: "invalid-assessment-percentage",
      message:
        "Fixed Monthly Assessment is unavailable because this Unit has an invalid Assessment Percentage.",
      planYear,
    };
  }

  return {
    status: "ready",
    data: {
      unitId,
      planYear,
      currency: plan.currency,
      monthlyOperatingBudget: String(plan.monthly_operating_budget),
      assessmentPercentage: unit.participation_percentage,
      fixedMonthlyAssessment,
    },
  };
}

export type { BudgetPlanInput, BudgetPlanRecord };
