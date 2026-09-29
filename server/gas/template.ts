import type { GasReadingSummary } from "./types";

type GasTemplateUnit = {
  id: string;
  unit_number: string;
  unit_type_code: string;
  has_gas_service: boolean | null;
};

export type GasReadingTemplateRow = {
  unitNumber: string;
  previousReading: number | null;
  currentReading: null;
  readingDate: null;
};

export function buildGasReadingTemplateRows(
  units: GasTemplateUnit[],
  readings: GasReadingSummary[],
  targetMonth: string,
): GasReadingTemplateRow[] {
  const eligibleUnits = units.filter((unit) => unit.unit_type_code === "condo" && unit.has_gas_service);

  return eligibleUnits.map((unit) => {
    const previous = readings
      .filter((reading) => reading.unit_id === unit.id && reading.reading_month.slice(0, 7) < targetMonth)
      .sort((left, right) => right.reading_month.localeCompare(left.reading_month))[0] ?? null;

    return {
      unitNumber: unit.unit_number,
      previousReading: previous?.current_reading ?? null,
      currentReading: null,
      readingDate: null,
    };
  });
}
