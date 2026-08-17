import type {
  MonthlyObligationComponent,
  MonthlyObligationComponentKey,
  MonthlyObligationProvider,
  MonthlyObligationProviderResult,
  MonthlyObligationReadContext,
  MonthlyObligationReadiness,
  MonthlyObligationResult,
  UnitMonthlyObligation,
} from "./types";

type ProviderMap = Partial<Record<MonthlyObligationComponentKey, MonthlyObligationProvider>>;

const DEFAULT_COMPONENT_ORDER: MonthlyObligationComponentKey[] = [
  "fixed_assessment",
  "metered_water",
  "common_water",
  "gas",
  "other_charge",
];

const COMPONENT_LABELS: Record<MonthlyObligationComponentKey, string> = {
  fixed_assessment: "Fixed Monthly Assessment",
  metered_water: "Metered Water",
  common_water: "Common Water",
  gas: "Gas",
  other_charge: "Other Charges",
};

function parseDecimalValue(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return {
    integer: BigInt(`${whole}${normalizedFraction || ""}`),
    scale: normalizedFraction.length > 0 ? BigInt(10 ** normalizedFraction.length) : BigInt(1),
  };
}

function formatMoney(cents: bigint) {
  const negative = cents < BigInt(0);
  const absolute = negative ? -cents : cents;
  const whole = absolute / BigInt(100);
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function centsFromDecimal(value: string) {
  const parsed = parseDecimalValue(value);
  if (!parsed) return null;
  return (parsed.integer * BigInt(100)) / parsed.scale;
}

function moneyAdd(a: string, b: string) {
  const left = centsFromDecimal(a);
  const right = centsFromDecimal(b);
  if (left === null || right === null) return null;
  return formatMoney(left + right);
}

function createAvailableComponent(
  key: MonthlyObligationComponentKey,
  amount: string,
  provenance: string,
  sourceMonth: string | null = null,
  lineItems?: MonthlyObligationComponent["lineItems"],
): MonthlyObligationComponent {
  return {
    key,
    label: COMPONENT_LABELS[key],
    status: "available",
    amount,
    currency: "PEN",
    sourceMonth,
    provenance,
    blocker: null,
    lineItems,
  };
}

function createMissingComponent(
  key: MonthlyObligationComponentKey,
  blocker: string,
  provenance: string,
  sourceMonth: string | null = null,
): MonthlyObligationComponent {
  return {
    key,
    label: COMPONENT_LABELS[key],
    status: "missing",
    amount: null,
    currency: "PEN",
    sourceMonth,
    provenance,
    blocker,
  };
}

function createBlockedComponent(
  key: MonthlyObligationComponentKey,
  blocker: string,
  provenance: string,
  sourceMonth: string | null = null,
): MonthlyObligationComponent {
  return {
    key,
    label: COMPONENT_LABELS[key],
    status: "blocked",
    amount: null,
    currency: "PEN",
    sourceMonth,
    provenance,
    blocker,
  };
}

function createNotApplicableComponent(
  key: MonthlyObligationComponentKey,
  provenance: string,
  sourceMonth: string | null = null,
): MonthlyObligationComponent {
  return {
    key,
    label: COMPONENT_LABELS[key],
    status: "not_applicable",
    amount: null,
    currency: "PEN",
    sourceMonth,
    provenance,
    blocker: null,
  };
}

function summarize(components: MonthlyObligationComponent[]) {
  const missingComponents = components
    .filter((component) => component.status === "missing")
    .map((component) => component.key);
  const blockers = components
    .filter((component) => component.status === "missing" || component.status === "blocked")
    .map((component) => component.blocker)
    .filter((blocker): blocker is string => Boolean(blocker));
  const readiness: MonthlyObligationReadiness =
    blockers.length > 0 ? "blocked" : missingComponents.length > 0 ? "in_progress" : "ready";
  return { missingComponents, blockers, readiness };
}

function sumAmounts(components: MonthlyObligationComponent[]) {
  let total = "0.00";
  for (const component of components) {
    if (component.status !== "available" || !component.amount) continue;
    const next = moneyAdd(total, component.amount);
    if (!next) return null;
    total = next;
  }
  return total;
}

function mapProviderResult(
  key: MonthlyObligationComponentKey,
  result: MonthlyObligationProviderResult,
): MonthlyObligationComponent {
  if (result.status === "available") {
    return createAvailableComponent(key, result.amount, result.provenance, result.sourceMonth ?? null, result.lineItems);
  }
  if (result.status === "missing") {
    return createMissingComponent(key, result.blocker, result.provenance, result.sourceMonth ?? null);
  }
  if (result.status === "blocked") {
    return createBlockedComponent(key, result.blocker, result.provenance, result.sourceMonth ?? null);
  }
  return createNotApplicableComponent(key, result.provenance, result.sourceMonth ?? null);
}

export async function composeMonthlyObligation(
  context: MonthlyObligationReadContext,
  units: Array<{
    unitId: string;
    unitNumber: string;
    unitAccountId: string;
    unitTypeCode: string;
    hasMeter: boolean;
    participationPercentage: number | null;
  }>,
  providers: ProviderMap,
): Promise<MonthlyObligationResult> {
  const composedUnits: UnitMonthlyObligation[] = [];

  for (const unit of units) {
    const components: MonthlyObligationComponent[] = [];
    for (const key of DEFAULT_COMPONENT_ORDER) {
      const provider = providers[key];
      if (!provider) continue;
      const result = await provider({ context, unit });
      components.push(mapProviderResult(key, result));
    }

    const summary = summarize(components);
    composedUnits.push({
      unitId: unit.unitId,
      unitNumber: unit.unitNumber,
      unitAccountId: unit.unitAccountId,
      unitTypeCode: unit.unitTypeCode,
      components,
      knownTotal: sumAmounts(components) ?? "0.00",
      readiness: summary.readiness,
      missingComponents: summary.missingComponents,
      blockers: summary.blockers,
    });
  }

  const knownTotal = composedUnits.reduce((total, unit) => moneyAdd(total, unit.knownTotal) ?? total, "0.00");
  const missingComponents = [...new Set(composedUnits.flatMap((unit) => unit.missingComponents))];
  const blockers = [...new Set(composedUnits.flatMap((unit) => unit.blockers))];
  const readiness: MonthlyObligationReadiness =
    blockers.length > 0 ? "blocked" : missingComponents.length > 0 ? "in_progress" : "ready";

  return {
    obligationMonth: context.obligationMonth,
    buildingId: context.buildingId,
    buildingName: context.buildingName,
    units: composedUnits,
    knownTotal,
    readiness,
    missingComponents,
    blockers,
  };
}

export type { ProviderMap };
