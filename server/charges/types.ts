export type ChargeSchedule = "one_off" | "recurring";

export type ChargeRecord = {
  id: string;
  series_id: string;
  building_id: string;
  unit_id: string | null;
  owner_id: string | null;
  description: string;
  amount: number;
  schedule: ChargeSchedule;
  effective_from_month: string;
  effective_to_month: string | null;
  stop_note: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChargeSummary = ChargeRecord & {
  target_label: string;
  target_unit_number: string | null;
  current_amount: number;
  current_effective_from_month: string;
  current_effective_to_month: string | null;
  current_stop_note: string | null;
  state: "future" | "active" | "ended" | "stopped";
};

export type ChargeLineItem = {
  chargeId: string;
  description: string;
  amount: string;
  effectiveFromMonth: string;
  effectiveToMonth: string | null;
};

export type ChargeInput = {
  unit_id: string;
  description: string;
  amount: number;
  schedule: ChargeSchedule;
  starts_month: string;
  ends_month?: string | null;
};

