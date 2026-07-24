export type WaterBillRecord = {
  id: string;
  building_id: string;
  utility_type_id: string;
  billing_period_id: string | null;
  supplier_id: string | null;
  bill_date: string;
  amount: number;
  description: string | null;
  attachment_document_id: string | null;
  status: string;
  notes: string | null;
  previous_reading: number;
  current_reading: number;
  total_consumption: number;
  unit_cost: number;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WaterBillSummary = WaterBillRecord & {
  utility_type_name: string;
  billing_period_status: string | null;
  is_editable: boolean;
};

export type WaterBillFormState = {
  success?: string;
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "bill_date"
      | "previous_reading"
      | "current_reading"
      | "amount"
      | "description"
      | "notes",
      string
    >
  >;
  values?: Partial<{
    bill_date: string;
    previous_reading: string;
    current_reading: string;
    amount: string;
    description: string;
    notes: string;
  }>;
  lockState?: {
    isEditable: boolean;
    label: string;
  };
};
