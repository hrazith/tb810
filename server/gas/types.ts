import type { GasHistoricalGroup } from "./processed-groups";

export type GasBillStatus = "draft" | "processed";

// A Gas supplier purchase. Package membership is explicit:
// available -> selected (selected_obligation_month) -> reserved at handoff
// (reserved_billing_period_id) -> processed at approval (processed_at).
// The purchase date never assigns membership.
export type GasBillRecord = {
  id: string;
  building_id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string;
  amount: number;
  notes: string | null;
  processed_at: string | null;
  reserved_billing_period_id: string | null;
  selected_obligation_month: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type GasBillSummary = GasBillRecord & {
  status: GasBillStatus;
};

export type GasProcessedBundle = {
  billingPeriodId: string;
  monthKey: string;
  monthLabel: string;
  processedAt: string | null;
  bills: GasBillSummary[];
};

export type GasBillsWorkspaceData = {
  // The next Monthly Obligations package whose supplier pool is still open.
  poolMonthKey: string;
  poolMonthLabel: string;
  pendingBills: GasBillSummary[];
  // Purchases processed through TB810 approvals (test records excluded).
  processedBundles: GasProcessedBundle[];
  // Purchases consumed outside TB810, grouped by recorded billing-group provenance.
  historicalGroups: GasHistoricalGroup[];
  // Test supplier records used by approved test packages; read-only.
  testRecords: Array<{ bill: GasBillSummary; packageLabel: string | null }>;
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
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string;
  amount: number;
  notes?: string | null;
};

export type GasReadingInput = {
  unit_id: string;
  reading_month: string;
  reading_date: string;
  previous_reading?: number | null;
  current_reading: number;
  notes?: string | null;
};
