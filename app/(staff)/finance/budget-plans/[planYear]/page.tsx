import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getBudgetPlanByYear } from "@/server/budget-plans";
import { getCurrentBuilding } from "@/server/units";

import { upsertBudgetPlanAction } from "./actions";
import { BudgetPlanForm } from "./_components/budget-plan-form";

type PageProps = {
  params: Promise<{
    planYear: string;
  }>;
};

function parsePlanYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
}

export default async function BudgetPlanPage({ params }: PageProps) {
  const { planYear: planYearParam } = await params;
  const planYear = parsePlanYear(planYearParam);

  if (!planYear) {
    notFound();
  }

  const [buildingResult, budgetPlanResult] = await Promise.all([
    getCurrentBuilding(),
    getBudgetPlanByYear(planYear),
  ]);

  if (buildingResult.error) {
    throw new Error(buildingResult.error);
  }

  if (!buildingResult.data) {
    notFound();
  }

  if (budgetPlanResult.error) {
    throw new Error(budgetPlanResult.error);
  }

  const building = buildingResult.data;
  const budgetPlan = budgetPlanResult.data;

  return (
    <section className="space-y-6">
    

      <div className="space-y-3">
        <div className=" my-12 px-6">
        <h2 className="text-xl font-semibold text-zinc-950">
          Monthly Operating Budget
        </h2>
        </div>
        <BudgetPlanForm
          budgetPlan={budgetPlan}
          action={upsertBudgetPlanAction.bind(null, planYear)}
          planYear={planYear}
        />
      </div>
    </section>
  );
}
