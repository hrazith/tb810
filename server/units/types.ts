export type UnitTypeCode = "condo" | "parking" | "storage";

export type UnitFilters = {
  query?: string;
  unitTypeId?: string;
};

export type UnitRecord = {
  id: string;
  building_id: string;
  unit_type_id: string;
  unit_number: string;
  floor: string | null;
  registered_area_m2: number | null;
  participation_percentage: number;
  has_meter: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type UnitListItem = UnitRecord & {
  unit_type_name: string;
  unit_type_code: UnitTypeCode;
  current_owner_id: string | null;
  current_owner_name: string | null;
  current_owner_reference: string | null;
};

export type UnitDetail = UnitRecord & {
  unit_type_name: string;
  unit_type_code: UnitTypeCode;
  building_name: string;
};

export type UnitTypeRecord = {
  id: string;
  code: UnitTypeCode;
  name: string;
  sort_order: number;
};

export type BuildingRecord = {
  id: string;
  name: string;
};

export type UnitInput = {
  building_id: string;
  unit_type_id: string;
  unit_number: string;
  floor?: string | null;
  registered_area_m2?: number | null;
  participation_percentage: number;
  has_meter: boolean;
  notes?: string | null;
};

export type UnitFormState = {
  success?: string;
  error?: string;
  fieldErrors?: Partial<Record<keyof UnitInput | "status", string>>;
  values?: Partial<UnitInput> & { active?: boolean };
};

export type UnitFormDefaults = {
  values: Partial<UnitInput>;
  building: BuildingRecord | null;
  buildings: BuildingRecord[];
  unitTypes: UnitTypeRecord[];
};
