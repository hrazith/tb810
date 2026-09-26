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
  readingDate: string | null,
  devSessionId?: string | null,
): Promise<{ data: MeterReadingImportWriteResult | null; error: string | null }> {
  if (!acceptedRows.length) {
    return { data: { insertedCount: 0, updatedCount: 0, processedCount: 0 }, error: null };
  }

  const supabase = await createClient();
  const rows = acceptedRows.map((row) => ({
    unit_id: row.unitId,
    reading_end: row.readingEnd,
    reading_date: row.readingDate ?? readingDate,
  }));
  const client = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(
    devSessionId ? "tb810_sync_dev_meter_reading_import" : "tb810_sync_meter_reading_import",
    devSessionId
      ? { p_session_id: devSessionId, p_month_key: monthKey, p_rows: rows }
      : { p_month_key: monthKey, p_rows: rows },
  );

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
