import { createClient } from "@/lib/supabase/server";
import { getFixedBuildingIdentity } from "@/server/building";
import { calculateGasCharges } from "@/server/gas/calculation";
import { getOwnerMonthlyObligationForBuilding } from "@/server/obligations/owner";
import { buildGasCalculationInputFromFacts, buildWaterPreviewFromFacts, loadBuildingMonthFinancialFacts } from "@/server/obligations/owner-facts";
import { loadPersistedObligationRows } from "@/server/obligations/persisted";
import type { MonthlyObligationComponent } from "@/server/obligations/types";
import { previousMonthKeyFromMonthKey } from "@/server/water/month-utils";

// Read-only data for the AVISO DE PAGO preview. Every amount comes from the
// canonical Owner obligation read model (persisted rows once the package is
// approved). Consumption and rates come from the canonical Water and Gas
// calculations; they are cross-checked against the read-model amounts and the
// document is refused on any mismatch.

export type AvisoUsage = {
  consumption: string;
  rate: string;
  periodLabel: string;
};

// Which AVISO group a line is presented in; set where the line is built.
export type AvisoLineKind = "fixed" | "water" | "common_water" | "gas" | "other";

export type AvisoLine = {
  kind: AvisoLineKind;
  label: string;
  amount: string;
  usage?: AvisoUsage;
};

export type AvisoUnit = {
  unitNumber: string;
  unitTypeCode: string;
  lines: AvisoLine[];
  subtotal: string;
};

export type OwnerAvisoData = {
  obligationMonth: string;
  owner: { name: string; reference: string };
  building: { address: string | null };
  packageStatus: string | null;
  units: AvisoUnit[];
  ownerDirect: { lines: AvisoLine[]; total: string } | null;
  currentTotal: string;
};

export type OwnerAvisoResult =
  | { data: OwnerAvisoData; error: null }
  | { data: null; error: string; status: number };


function spanishMonth(monthKey: string) {
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

const cents = (value: string | number) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);

function fail(error: string, status = 409): OwnerAvisoResult {
  return { data: null, error, status };
}

function componentOf(components: MonthlyObligationComponent[], key: MonthlyObligationComponent["key"]) {
  return components.find((component) => component.key === key);
}

export async function loadOwnerAvisoData({ ownerId, obligationMonth }: { ownerId: string; obligationMonth: string }): Promise<OwnerAvisoResult> {
  const building = getFixedBuildingIdentity();
  const supabase = await createClient();
  const [ownerResult, factsResult, buildingResult] = await Promise.all([
    getOwnerMonthlyObligationForBuilding({ ownerId, obligationMonth, buildingId: building.id, buildingName: building.name }),
    loadBuildingMonthFinancialFacts({ buildingId: building.id, obligationMonth, client: supabase }),
    supabase.from("tb810_buildings").select("address").eq("id", building.id).maybeSingle(),
  ]);
  if (ownerResult.error) return fail(ownerResult.error, ownerResult.error === "Owner not found." ? 404 : 500);
  if (!ownerResult.data) return fail("Owner not found.", 404);
  if (factsResult.error || !factsResult.data) return fail(factsResult.error ?? "Building month facts unavailable.", 500);
  if (buildingResult.error) return fail(buildingResult.error.message, 500);

  const owner = ownerResult.data;
  const facts = factsResult.data.current;
  if (owner.readiness !== "ready" || owner.total.state !== "available" || owner.total.amount === null) {
    return fail(`Las obligaciones de ${obligationMonth} para este propietario aún no están completas.`);
  }

  // Water and Gas usage detail per Unit, from the canonical calculations.
  const waterByUnit = new Map<string, AvisoUsage & { amount: string }>();
  const gasByUnit = new Map<string, AvisoUsage & { amount: string }>();
  // Water is labelled by its source reading month (no usage-period rule is
  // documented). Gas readings close the usage of the previous month (GAS-003).
  const waterPeriodLabel = `lecturas de ${spanishMonth(facts.sourceReadingMonth)}`;
  const gasUsageLabel = (sourceMonth: string) => `consumo de ${spanishMonth(previousMonthKeyFromMonthKey(sourceMonth) ?? sourceMonth)}`;

  for (const unit of facts.unitRows) {
    const preview = buildWaterPreviewFromFacts(unit, obligationMonth, facts).meteredWater;
    if (preview.status === "available") {
      waterByUnit.set(unit.id, {
        amount: preview.data.amount,
        consumption: preview.data.unitConsumptionText,
        rate: preview.data.periodRateText,
        periodLabel: waterPeriodLabel,
      });
    }
  }

  const snapshot = facts.obligationSnapshot;
  if (snapshot) {
    // Approved package: the pool and each Unit's consumption are the ones
    // declared in the persisted Gas provenance.
    const rows = await loadPersistedObligationRows({ billingPeriodId: snapshot.billingPeriodId, unitIds: facts.unitRows.map((unit) => unit.id), client: supabase });
    if (rows.error) return fail(rows.error, 500);
    const gasRows = rows.data.filter((row) => row.obligation_type === "gas_consumption");
    const provenance = gasRows.map((row) => (row.calculation_snapshot as { gasProvenance?: { poolTotal?: string; unitConsumption?: string; sourceMonth?: string } } | null)?.gasProvenance);
    if (provenance.some((item) => !item?.poolTotal || item.unitConsumption === undefined)) return fail("La procedencia del Gas del paquete aprobado está incompleta.");
    const pools = new Set(provenance.map((item) => item!.poolTotal));
    if (pools.size > 1) return fail("La procedencia del Gas del paquete aprobado es inconsistente.");
    if (gasRows.length > 0) {
      const calculation = calculateGasCharges({
        sourceReadingMonth: provenance[0]!.sourceMonth ?? facts.gasSourceMonth,
        obligationMonth,
        supplierBills: [{ billId: "approved-pool", amount: String(provenance[0]!.poolTotal), status: "unprocessed" }],
        units: gasRows.map((row, index) => ({
          unitId: row.unit_id,
          unitNumber: row.unit_id,
          unitTypeCode: "condo",
          hasGasService: true,
          consumption: String(provenance[index]!.unitConsumption),
        })),
      });
      if (calculation.blockers.length > 0) return fail(calculation.blockers.join(" "));
      const periodLabel = gasUsageLabel(provenance[0]!.sourceMonth ?? facts.gasSourceMonth);
      for (const charge of calculation.unitCharges) {
        gasByUnit.set(charge.unitId, { amount: charge.amount, consumption: charge.consumption, rate: charge.blendedRate, periodLabel });
      }
    }
  } else {
    const calculation = calculateGasCharges(buildGasCalculationInputFromFacts(facts, obligationMonth));
    if (calculation.blockers.length === 0) {
      for (const charge of calculation.unitCharges) {
        gasByUnit.set(charge.unitId, { amount: charge.amount, consumption: charge.consumption, rate: charge.blendedRate, periodLabel: gasUsageLabel(facts.gasSourceMonth) });
      }
    }
  }

  const units: AvisoUnit[] = [];
  let unitsTotal = 0;
  for (const unit of owner.obligation.units) {
    const lines: AvisoLine[] = [];
    let componentsTotal = 0;
    for (const component of unit.components) {
      if (component.status === "not_applicable") continue;
      if (component.status !== "available" || component.amount === null) return fail(`La Unidad ${unit.unitNumber} tiene obligaciones incompletas.`);
      componentsTotal += cents(component.amount);
    }
    if (componentsTotal !== cents(unit.knownTotal)) return fail(`El total de la Unidad ${unit.unitNumber} no concilia.`);

    const fixed = componentOf(unit.components, "fixed_assessment");
    if (fixed?.status === "available" && fixed.amount) lines.push({ kind: "fixed", label: "Cuota de mantenimiento", amount: fixed.amount });

    const water = componentOf(unit.components, "metered_water");
    if (water?.status === "available" && water.amount) {
      const usage = waterByUnit.get(unit.unitId);
      if (!usage || cents(usage.amount) !== cents(water.amount)) return fail(`El consumo de agua de la Unidad ${unit.unitNumber} no concilia con la obligación.`);
      lines.push({ kind: "water", label: "Agua", amount: water.amount, usage: { consumption: usage.consumption, rate: usage.rate, periodLabel: usage.periodLabel } });
    }

    const commonWater = componentOf(unit.components, "common_water");
    if (commonWater?.status === "available" && commonWater.amount) lines.push({ kind: "common_water", label: "Agua común (Sedapal)", amount: commonWater.amount });

    const gas = componentOf(unit.components, "gas");
    if (gas?.status === "available" && gas.amount) {
      const usage = gasByUnit.get(unit.unitId);
      if (!usage || cents(usage.amount) !== cents(gas.amount)) return fail(`El consumo de gas de la Unidad ${unit.unitNumber} no concilia con la obligación.`);
      lines.push({ kind: "gas", label: "Gas", amount: gas.amount, usage: { consumption: usage.consumption, rate: usage.rate, periodLabel: usage.periodLabel } });
    }

    const other = componentOf(unit.components, "other_charge");
    if (other?.status === "available" && other.amount) {
      const items = other.lineItems ?? [];
      if (items.length > 0) {
        if (items.reduce((total, item) => total + cents(item.amount), 0) !== cents(other.amount)) return fail(`Los cargos de la Unidad ${unit.unitNumber} no concilian.`);
        for (const item of items) lines.push({ kind: "other", label: item.description, amount: item.amount });
      } else {
        lines.push({ kind: "other", label: "Otros cargos", amount: other.amount });
      }
    }

    unitsTotal += cents(unit.knownTotal);
    units.push({ unitNumber: unit.unitNumber, unitTypeCode: unit.unitTypeCode, lines, subtotal: money(cents(unit.knownTotal)) });
  }

  let ownerDirect: OwnerAvisoData["ownerDirect"] = null;
  const direct = owner.ownerDirectCharges;
  if (direct.state !== "available") return fail("Los cargos directos del propietario no están disponibles.");
  const directTotal = cents(direct.amount ?? 0);
  if (direct.lineItems.length > 0) {
    if (direct.lineItems.reduce((total, item) => total + cents(item.amount), 0) !== directTotal) return fail("Los cargos directos del propietario no concilian.");
    ownerDirect = { lines: direct.lineItems.map((item) => ({ kind: "other", label: item.description, amount: item.amount })), total: money(directTotal) };
  }

  if (unitsTotal + directTotal !== cents(owner.total.amount)) return fail("El total del propietario no concilia con sus Unidades y cargos directos.");

  return {
    data: {
      obligationMonth,
      owner: { name: owner.owner.full_name, reference: owner.owner.owner_reference },
      building: { address: buildingResult.data?.address ?? null },
      packageStatus: facts.obligationLifecycle.billingPeriodStatus,
      units,
      ownerDirect,
      currentTotal: money(cents(owner.total.amount)),
    },
    error: null,
  };
}
