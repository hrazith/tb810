"use server";

import { revalidatePath } from "next/cache";

import { saveMonthlyWaterLedgerReadings } from "@/server/water/monthly-ledger";

type WaterLedgerFormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

function parseReadings(formData: FormData) {
  const values: Array<{ unit_id: string; current_reading: string }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("reading_")) continue;
    const unitId = key.slice("reading_".length);
    if (!unitId) continue;

    values.push({
      unit_id: unitId,
      current_reading: String(value ?? ""),
    });
  }

  return values;
}

export async function saveMonthlyWaterLedgerAction(
  _prev: WaterLedgerFormState,
  formData: FormData,
): Promise<WaterLedgerFormState> {
  const periodKey = String(formData.get("period_key") ?? "");
  const readings = parseReadings(formData);

  const result = await saveMonthlyWaterLedgerReadings({
    period_key: periodKey,
    readings,
  });

  if (result.error) {
    return {
      error: result.error,
      values: Object.fromEntries(formData.entries().map(([key, value]) => [key, String(value)])),
    };
  }

  revalidatePath(`/water/${periodKey}`);

  return {
    success: `Saved ${result.data.created + result.data.updated} unit readings.`,
    values: Object.fromEntries(formData.entries().map(([key, value]) => [key, String(value)])),
  };
}
