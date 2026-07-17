import type { UnitTypeCode } from "@/server/units/types";
export type {
  OwnershipTransferFormInput,
  OwnershipTransferInput,
} from "./validation";

export type OwnershipRecord = {
  id: string;
  owner_id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type OwnershipWithRelations = OwnershipRecord & {
  owner: {
    id: string;
    full_name: string;
    owner_reference: string;
    active: boolean;
  };
  unit_number: string;
  unit_type_code: UnitTypeCode;
  unit_type_name: string;
  ownership_status: "current" | "scheduled" | "past";
};

export type UnitAccountSummary = {
  id: string;
  account_number: string | null;
  status: string;
  current_balance: number;
  credit_balance: number;
};

export type UnitOwnershipSnapshot = {
  currentOwnership: OwnershipWithRelations | null;
  scheduledOwnerships: OwnershipWithRelations[];
  ownershipHistory: OwnershipWithRelations[];
  unitAccount: UnitAccountSummary | null;
};

export type OwnerUnitSummary = {
  unit_id: string;
  unit_number: string;
  unit_type_code: UnitTypeCode;
  unit_type_name: string;
  ownership_start_date: string;
  ownership_end_date: string | null;
  ownership_status: "current" | "scheduled" | "past";
};

export type OwnerUnitsSnapshot = {
  currentUnits: OwnerUnitSummary[];
  scheduledUnits: OwnerUnitSummary[];
  pastUnits: OwnerUnitSummary[];
};

export type OwnershipTransferDefaults = {
  unit: {
    id: string;
    unit_number: string;
    unit_type_name: string;
    unit_type_code: UnitTypeCode;
  };
  unitAccount: UnitAccountSummary | null;
  currentOwnership: OwnershipWithRelations | null;
  owners: Array<{
    id: string;
    full_name: string;
    owner_reference: string;
    active: boolean;
  }>;
  suggestedEffectiveMonth: string;
  minimumEffectiveMonth: string;
};
