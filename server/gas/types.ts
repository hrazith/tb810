export type GasBillStatus = "draft" | "processed";

export type GasBillRecord = {
  id: string;
  building_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  notes: string | null;
  processed_at: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type GasBillSummary = GasBillRecord & {
  status: GasBillStatus;
};

export type GasReadingRecord = {
  id: string;
  building_id: string;
  unit_id: string;
  reading_month: string;
  reading_date: string;
  previous_reading: number | null;
  current_reading: number;
  consumption: number | null;
  notes: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type GasReadingSummary = GasReadingRecord & {
  unit_number: string;
  floor: string | null;
  unit_type_code: "condo" | "parking" | "storage";
};

export type GasBillInput = {
  building_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  notes?: string | null;
};

export type GasReadingInput = {
  building_id: string;
  unit_id: string;
  reading_month: string;
  reading_date: string;
  previous_reading?: number | null;
  current_reading: number;
  notes?: string | null;
};
