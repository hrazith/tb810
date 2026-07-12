export type OwnerStatus = "active" | "inactive";

export type OwnerRecord = {
  id: string;
  full_name: string;
  owner_reference: string;
  email: string | null;
  phone_number: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OwnerSummary = OwnerRecord & {
  unit_count: number;
};

export type OwnerInput = {
  full_name: string;
  email?: string | null;
  phone_number?: string | null;
  notes?: string | null;
};

export type OwnerFilters = {
  query?: string;
  status?: "active" | "archived" | "all";
};

export type OwnerFormState = {
  success?: string;
  error?: string;
  fieldErrors?: Partial<Record<keyof OwnerInput | "status", string>>;
  values?: OwnerInput;
};
