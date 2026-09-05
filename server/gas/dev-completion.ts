export type GasCompletionUnit = {
  id: string;
  unit_number: string;
  unit_type_code: "condo" | "parking" | "storage";
  has_gas_service: boolean;
};

export type GasCompletionReading = {
  unit_id: string;
  reading_month: string;
  current_reading: number;
  previous_reading: number | null;
  consumption: number | null;
};

export type GasCompletionDraft = {
  unitId: string;
  unitNumber: string;
  readingMonth: string;
  readingDate: string;
  previousReading: number | null;
  currentReading: number;
  consumption: number;
};

function monthKeyFromDateKey(value: string) {
  return value.slice(0, 7);
}

function roundToThree(value: number) {
  return Number(value.toFixed(3));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function priorReadingsForUnit(readings: GasCompletionReading[], unitId: string, sourceReadingMonth: string) {
  return readings
    .filter((reading) => reading.unit_id === unitId && monthKeyFromDateKey(reading.reading_month) < sourceReadingMonth)
    .sort((left, right) => right.reading_month.localeCompare(left.reading_month));
}

export function buildMissingGasReadingDrafts(input: {
  sourceReadingMonth: string;
  readingDate: string;
  units: GasCompletionUnit[];
  readings: GasCompletionReading[];
}): GasCompletionDraft[] {
  const eligibleUnits = input.units.filter((unit) => unit.unit_type_code === "condo" && unit.has_gas_service);
  const sourceMonthReadings = new Map<string, GasCompletionReading>();
  for (const reading of input.readings) {
    if (monthKeyFromDateKey(reading.reading_month) !== input.sourceReadingMonth) continue;
    if (!sourceMonthReadings.has(reading.unit_id)) {
      sourceMonthReadings.set(reading.unit_id, reading);
    }
  }

  const currentMonthConsumptionValues = [...sourceMonthReadings.values()]
    .map((reading) => reading.consumption)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const currentMonthAverageConsumption = average(currentMonthConsumptionValues);

  return eligibleUnits
    .filter((unit) => !sourceMonthReadings.has(unit.id))
    .map((unit) => {
      const priorReadings = priorReadingsForUnit(input.readings, unit.id, input.sourceReadingMonth);
      const previousReading = priorReadings[0] ?? null;
      const historicalConsumptionValues = priorReadings
        .map((reading) => reading.consumption)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
      const historicalAverageConsumption = average(historicalConsumptionValues);
      const baselineConsumption =
        previousReading?.consumption ??
        historicalAverageConsumption ??
        currentMonthAverageConsumption ??
        1;
      const generatedConsumption = roundToThree(Math.max(0.001, baselineConsumption));
      const currentReading = roundToThree((previousReading?.current_reading ?? 0) + generatedConsumption);

      return {
        unitId: unit.id,
        unitNumber: unit.unit_number,
        readingMonth: `${input.sourceReadingMonth}-01`,
        readingDate: input.readingDate,
        previousReading: previousReading?.current_reading ?? null,
        currentReading,
        consumption: generatedConsumption,
      };
    });
}
