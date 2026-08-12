import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding, listUnits } from "@/server/units";

import { calculateGasCharges, type GasCalculationResult } from "./calculation";
import { isEligibleGasBill, previousMonthKeyFromMonthKey } from "./month-utils";

export type GasChargePreviewState =
  | {
      status: "available";
      data: GasCalculationResult & {
        sourceReadingMonthLabel: string;
        billingMonthLabel: string;
      };
    }
  | {
      status: "not-applicable" | "unavailable";
      message: string;
    };

function monthLabelFromKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function nextMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export async function listGasReadingsForMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  sourceReadingMonth: string,
) {
  const { data, error } = await supabase
    .from("tb810_gas_readings")
    .select("id, unit_id, reading_month, current_reading, previous_reading, consumption")
    .eq("building_id", buildingId)
    .eq("reading_month", `${sourceReadingMonth}-01`);

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function getGasChargePreviewsForUnit(
  unitId: string,
  obligationMonth: string,
): Promise<GasChargePreviewState> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { status: "unavailable", message: buildingResult.error };
  if (!buildingResult.data) return { status: "unavailable", message: "Current building not found." };

  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth);
  if (!sourceReadingMonth) {
    return { status: "unavailable", message: "Gas lookup data is incomplete." };
  }

  const supabase = await createClient();
  const [unitResult, unitsResult, billResult, readingResult] = await Promise.all([
    supabase
      .from("tb810_units")
      .select("id, unit_type_id, unit_number, has_gas_service")
      .eq("building_id", buildingResult.data.id)
      .eq("id", unitId)
      .maybeSingle(),
    listUnits(),
    supabase
      .from("tb810_gas_bills")
      .select("id, amount, processed_at, invoice_date")
      .eq("building_id", buildingResult.data.id)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false }),
    listGasReadingsForMonth(supabase, buildingResult.data.id, sourceReadingMonth),
  ]);

  if (unitResult.error) return { status: "unavailable", message: unitResult.error.message };
  if (unitsResult.error) return { status: "unavailable", message: unitsResult.error };
  if (billResult.error) return { status: "unavailable", message: billResult.error.message };
  if (readingResult.error) return { status: "unavailable", message: readingResult.error };
  const unitRow = unitResult.data;
  if (!unitRow) return { status: "unavailable", message: "Unit not found." };

  const { data: unitType, error: unitTypeError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name")
    .eq("id", unitRow.unit_type_id)
    .maybeSingle();
  if (unitTypeError) return { status: "unavailable", message: unitTypeError.message };
  if (!unitType || unitType.code !== "condo") {
    return { status: "not-applicable", message: "Gas is not applicable for this Unit." };
  }

  const gasUnit = unitsResult.data.find((item) => item.id === unitRow.id);
  if (!gasUnit || !gasUnit.has_gas_service) {
    return { status: "not-applicable", message: "Gas is not applicable for this Unit." };
  }

  const gasBillsForMonth = (billResult.data ?? []).filter((bill) => isEligibleGasBill(bill.invoice_date, bill.processed_at, obligationMonth));
  const readingsForMonth = new Map<
    string,
    {
      unit_id: string;
      reading_month: string;
      current_reading: number;
      previous_reading: number | null;
      consumption: number | null;
    }
  >();
  for (const row of readingResult.data ?? []) {
    if (row.reading_month.slice(0, 7) !== sourceReadingMonth) continue;
    if (!readingsForMonth.has(row.unit_id)) {
      readingsForMonth.set(row.unit_id, row);
    }
  }
  const gasUnits = unitsResult.data.filter((item) => item.unit_type_code === "condo" && item.has_gas_service);
  const chargesInput = {
    sourceReadingMonth,
    obligationMonth: nextMonthLabel(sourceReadingMonth)?.slice(0, 7) ?? sourceReadingMonth,
    supplierBills: gasBillsForMonth.map((bill) => ({
      billId: bill.id,
      amount: String(bill.amount),
      status: bill.processed_at ? ("processed" as const) : ("unprocessed" as const),
    })),
    units: gasUnits.map((gasUnit) => {
      const reading = readingsForMonth.get(gasUnit.id);
      return {
        unitId: gasUnit.id,
        unitNumber: gasUnit.unit_number,
        unitTypeCode: gasUnit.unit_type_code,
        hasGasService: Boolean(gasUnit.has_gas_service),
        readingMonth: sourceReadingMonth,
        consumption: reading?.consumption == null ? null : String(reading.consumption),
      };
    }),
  };

  const calculation = calculateGasCharges(chargesInput);
  const sourceReadingMonthLabel = monthLabelFromKey(sourceReadingMonth);
  const billingMonthLabel = nextMonthLabel(sourceReadingMonth);
  if (!sourceReadingMonthLabel || !billingMonthLabel) {
    return { status: "unavailable", message: "Gas lookup data is incomplete." };
  }

  if (calculation.blockers.length > 0) {
    return {
      status: "unavailable",
      message: calculation.blockers.join(" "),
    };
  }

  return {
    status: "available",
    data: {
      ...calculation,
      sourceReadingMonthLabel,
      billingMonthLabel,
    },
  };
}
