type WaterReading = {
  unit_id: string;
  reading_end: number | null;
  consumption: number | string | null;
};

export function hasCompleteWaterReadings(input: {
  eligibleUnitIds: readonly string[];
  readings: readonly WaterReading[];
}) {
  const eligible = new Set(input.eligibleUnitIds);
  if (input.readings.length !== eligible.size) return false;

  const seen = new Set<string>();
  return input.readings.every((reading) => {
    if (!eligible.has(reading.unit_id) || seen.has(reading.unit_id)) return false;
    seen.add(reading.unit_id);
    const consumption = reading.consumption === null ? NaN : Number(reading.consumption);
    return reading.reading_end !== null && Number.isFinite(consumption) && consumption >= 0;
  }) && seen.size === eligible.size;
}
