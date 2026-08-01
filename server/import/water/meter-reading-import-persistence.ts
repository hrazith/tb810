import { createClient } from "@/lib/supabase/server";

import type { ValidatedMeterReadingImportRow } from "./meter-reading-import-validator";

export type MeterReadingImportWriteResult = {
  insertedCount: number;
  updatedCount: number;
  processedCount: number;
};

type RpcResult = {
  inserted_count?: number;
  updated_count?: number;
  processed_count?: number;
};

export async function persistMeterReadingImport(
  monthKey: string,
  acceptedRows: ValidatedMeterReadingImportRow[],
): Promise<{ data: MeterReadingImportWriteResult | null; error: string | null }> {
  if (!acceptedRows.length) {
    return { data: { insertedCount: 0, updatedCount: 0, processedCount: 0 }, error: null };
  }

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("tb810_sync_meter_reading_import", {
    p_month_key: monthKey,
    p_rows: acceptedRows.map((row) => ({
      unit_id: row.unitId,
      reading_end: row.readingEnd,
    })),
  });

  if (error) {
    return { data: null, error: error.message };
  }

  const payload = (Array.isArray(data) ? data[0] : data) as RpcResult | undefined;
  if (!payload) {
    return { data: null, error: "Import persistence returned no result." };
  }
  return {
    data: {
      insertedCount: Number(payload.inserted_count ?? 0),
      updatedCount: Number(payload.updated_count ?? 0),
      processedCount: Number(payload.processed_count ?? 0),
    },
    error: null,
  };
}
