import type {
  MonthlyObligationComponentKey,
  MonthlyObligationResult,
  UnitMonthlyObligation,
} from "./types";

export type OwnerComponentSummary = Record<
  MonthlyObligationComponentKey,
  {
    amount: string | null;
    state: "available" | "blocked" | "not_applicable";
    count: number;
    reason: string | null;
  }
>;

export type OwnerDirectChargeSummary = {
  state: "available" | "blocked";
  amount: string | null;
  count: number;
  reason: string | null;
  lineItems: Array<{
    chargeId: string;
    description: string;
    amount: string;
    effectiveFromMonth: string;
    effectiveToMonth: string | null;
  }>;
};

export type OwnerMonthlyObligationComposition = {
  ownerId: string;
  ownerReference: string;
  ownerName: string;
  obligationMonth: string;
  units: UnitMonthlyObligation[];
  componentSummary: OwnerComponentSummary;
  ownerDirectCharges: OwnerDirectChargeSummary;
  total: {
    state: "available" | "blocked";
    amount: string | null;
  };
  readiness: MonthlyObligationResult["readiness"];
};

function centsFromDecimal(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = fraction.padEnd(2, "0").slice(0, 2);
  return BigInt(`${whole}${normalized}`);
}

function addMoney(left: string, right: string) {
  const leftCents = centsFromDecimal(left);
  const rightCents = centsFromDecimal(right);
  if (leftCents === null || rightCents === null) return null;
  const total = leftCents + rightCents;
  const whole = total / BigInt(100);
  const fraction = (total % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function createEmptyComponentSummary(): OwnerComponentSummary {
  return {
    fixed_assessment: { amount: null, state: "not_applicable", count: 0, reason: null },
    metered_water: { amount: null, state: "not_applicable", count: 0, reason: null },
    common_water: { amount: null, state: "not_applicable", count: 0, reason: null },
    gas: { amount: null, state: "not_applicable", count: 0, reason: null },
    other_charge: { amount: null, state: "not_applicable", count: 0, reason: null },
  };
}

export function composeOwnerMonthlyObligation(input: {
  ownerId: string;
  ownerReference: string;
  ownerName: string;
  obligationMonth: string;
  units: UnitMonthlyObligation[];
  ownerDirectCharges: OwnerDirectChargeSummary;
}): OwnerMonthlyObligationComposition {
  const unitBlockers = [...new Set(input.units.flatMap((unit) => unit.blockers))];
  const unitMissingComponents = [...new Set(input.units.flatMap((unit) => unit.missingComponents))];
  const unitReadiness: MonthlyObligationResult["readiness"] =
    unitBlockers.length > 0 ? "blocked" : unitMissingComponents.length > 0 ? "in_progress" : "ready";

  const componentSummary = createEmptyComponentSummary();
  for (const unit of input.units) {
    for (const component of unit.components) {
      const summary = componentSummary[component.key];
      summary.count += 1;
      if (component.status === "available" && component.amount) {
        summary.amount = summary.amount ? addMoney(summary.amount, component.amount) : component.amount;
        summary.state = "available";
      } else if (component.status === "blocked") {
        summary.state = "blocked";
        summary.reason = summary.reason ?? component.blocker;
      } else if (component.status === "missing" && summary.state === "not_applicable") {
        summary.state = "blocked";
        summary.reason = summary.reason ?? component.blocker;
      } else if (component.status === "not_applicable" && summary.state === "not_applicable") {
        summary.reason = summary.reason ?? null;
      }
    }
  }

  const unitTotal = input.units.reduce((total, unit) => addMoney(total, unit.knownTotal) ?? total, "0.00");

  const totalAmount =
    unitReadiness === "blocked" || input.ownerDirectCharges.state === "blocked"
      ? null
      : addMoney(unitTotal, input.ownerDirectCharges.amount ?? "0.00");

  return {
    ownerId: input.ownerId,
    ownerReference: input.ownerReference,
    ownerName: input.ownerName,
    obligationMonth: input.obligationMonth,
    units: input.units,
    componentSummary,
    ownerDirectCharges: input.ownerDirectCharges,
    total: {
      state: totalAmount === null ? "blocked" : "available",
      amount: totalAmount,
    },
    readiness:
      unitReadiness === "blocked" || input.ownerDirectCharges.state === "blocked"
        ? "blocked"
        : unitReadiness,
  };
}
