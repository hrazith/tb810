export type GasCalculationBill = {
  billId: string;
  amount: string;
  status: "unprocessed" | "processed";
};

export type GasCalculationUnit = {
  unitId: string;
  unitNumber: string;
  unitTypeCode: "condo" | "parking" | "storage";
  hasGasService: boolean;
  readingMonth?: string | null;
  consumption?: string | null;
};

export type GasCalculationInput = {
  sourceReadingMonth: string;
  obligationMonth: string;
  supplierBills: GasCalculationBill[];
  units: GasCalculationUnit[];
};

export type GasUnitCharge = {
  unitId: string;
  unitNumber: string;
  consumption: string;
  blendedRate: string;
  amount: string;
  status: "available" | "missing" | "not_applicable";
  explanation: string;
};

export type GasCalculationResult = {
  sourceReadingMonth: string;
  obligationMonth: string;
  gasCostPool: string;
  totalConsumption: string;
  blendedRate: string | null;
  unitCharges: GasUnitCharge[];
  missingUnits: Array<{
    unitId: string;
    unitNumber: string;
    explanation: string;
  }>;
  excludedUnits: Array<{
    unitId: string;
    unitNumber: string;
    explanation: string;
  }>;
  blockers: string[];
};

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatConsumption(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "0.000";
}

function formatRate(value: number) {
  return Number.isFinite(value) ? value.toFixed(6) : "0.000000";
}

export function calculateGasCharges(input: GasCalculationInput): GasCalculationResult {
  const participatingUnits = input.units.filter((unit) => unit.unitTypeCode === "condo" && unit.hasGasService);
  const excludedUnits = input.units
    .filter((unit) => !(unit.unitTypeCode === "condo" && unit.hasGasService))
    .map((unit) => ({
      unitId: unit.unitId,
      unitNumber: unit.unitNumber,
      explanation: unit.unitTypeCode === "condo" ? "Unit is not enrolled in Gas service." : "Parking and storage units do not participate in Gas service.",
    }));

  const gasCostPoolValue = input.supplierBills.reduce((total, bill) => {
    if (bill.status !== "unprocessed") return total;
    const amount = parseAmount(bill.amount);
    return amount == null ? total : total + amount;
  }, 0);

  const missingUnits: GasCalculationResult["missingUnits"] = [];
  const consumptionByUnit = new Map<string, number>();

  for (const unit of participatingUnits) {
    if (unit.consumption == null) {
      missingUnits.push({
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        explanation: `Missing gas reading for ${unit.unitNumber} in ${input.sourceReadingMonth}.`,
      });
      continue;
    }
    const consumption = Number(unit.consumption);
    if (!Number.isFinite(consumption)) {
      missingUnits.push({
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        explanation: `Missing gas reading for ${unit.unitNumber} in ${input.sourceReadingMonth}.`,
      });
      continue;
    }
    consumptionByUnit.set(unit.unitId, consumption);
  }

  const totalConsumptionValue = [...consumptionByUnit.values()].reduce((total, value) => total + value, 0);
  const blockers: string[] = [];
  if (missingUnits.length > 0) blockers.push("Required gas readings are missing.");
  if (totalConsumptionValue === 0) blockers.push("Total gas consumption is zero.");

  if (blockers.length > 0) {
    return {
      sourceReadingMonth: input.sourceReadingMonth,
      obligationMonth: input.obligationMonth,
      gasCostPool: formatMoney(gasCostPoolValue),
      totalConsumption: formatConsumption(totalConsumptionValue),
      blendedRate: null,
      unitCharges: participatingUnits.map((unit) => {
        const consumption = consumptionByUnit.get(unit.unitId);
        return {
          unitId: unit.unitId,
          unitNumber: unit.unitNumber,
          consumption: formatConsumption(consumption ?? 0),
          blendedRate: "0.000000",
          amount: "0.00",
          status: consumption == null ? "missing" : "available",
          explanation: consumption == null ? `Missing gas reading for ${unit.unitNumber} in ${input.sourceReadingMonth}.` : "Pending blocker resolution.",
        };
      }),
      missingUnits,
      excludedUnits,
      blockers,
    };
  }

  const blendedRateValue = gasCostPoolValue / totalConsumptionValue;

  return {
    sourceReadingMonth: input.sourceReadingMonth,
    obligationMonth: input.obligationMonth,
    gasCostPool: formatMoney(gasCostPoolValue),
    totalConsumption: formatConsumption(totalConsumptionValue),
    blendedRate: formatRate(blendedRateValue),
    unitCharges: participatingUnits.map((unit) => {
      const consumption = consumptionByUnit.get(unit.unitId) ?? 0;
      const amount = consumption * blendedRateValue;
      return {
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        consumption: formatConsumption(consumption),
        blendedRate: formatRate(blendedRateValue),
        amount: formatMoney(amount),
        status: "available",
        explanation: `Unit consumption multiplied by blended rate for ${input.sourceReadingMonth}.`,
      };
    }),
    missingUnits,
    excludedUnits,
    blockers,
  };
}
