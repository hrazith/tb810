export type MonthlyObligationSummaryComponent = {
  amount: string | null;
  state: "available" | "blocked";
  reason?: string;
};

export type MonthlyObligationSummary = {
  obligationMonth: string;
  eligibleUnitCount: number;
  components: {
    fixed_assessment: MonthlyObligationSummaryComponent;
    metered_water: MonthlyObligationSummaryComponent;
    common_water: MonthlyObligationSummaryComponent;
    gas: MonthlyObligationSummaryComponent;
    other_charge: MonthlyObligationSummaryComponent & { count: number | null };
    owner_direct_charge: MonthlyObligationSummaryComponent & { count: number | null };
  };
  total: string | null;
};

export function buildMonthlyObligationSummary(input: {
  obligationMonth: string;
  eligibleUnitCount: number;
  fixedAssessment: MonthlyObligationSummaryComponent;
  meteredWater: MonthlyObligationSummaryComponent;
  commonWater: MonthlyObligationSummaryComponent;
  gas: MonthlyObligationSummaryComponent;
  otherChargeAmount: string;
  otherChargeCount: number;
  ownerDirectChargeAmount: string;
  ownerDirectChargeCount: number;
}) {
  const components = {
    fixed_assessment: input.fixedAssessment,
    metered_water: input.meteredWater,
    common_water: input.commonWater,
    gas: input.gas,
    other_charge: {
      state: "available" as const,
      amount: input.otherChargeAmount,
      count: input.otherChargeCount,
    },
    owner_direct_charge: {
      state: "available" as const,
      amount: input.ownerDirectChargeAmount,
      count: input.ownerDirectChargeCount,
    },
  };

  const total =
    components.fixed_assessment.state === "available" &&
    components.metered_water.state === "available" &&
    components.common_water.state === "available" &&
    components.gas.state === "available" &&
    components.other_charge.state === "available" &&
    components.owner_direct_charge.state === "available"
      ? [
          components.fixed_assessment.amount,
          components.metered_water.amount,
          components.common_water.amount,
          components.gas.amount,
          components.other_charge.amount,
          components.owner_direct_charge.amount,
        ]
          .map((value) => Number(value))
          .reduce((sum, value) => sum + value, 0)
          .toFixed(2)
      : null;

  return {
    obligationMonth: input.obligationMonth,
    eligibleUnitCount: input.eligibleUnitCount,
    components,
    total,
  } satisfies MonthlyObligationSummary;
}
